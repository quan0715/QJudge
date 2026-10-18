"""Real Docker tests for the per-submission container and isolation between its cases."""
from unittest import TestCase
from unittest.mock import patch

import docker

from .io_judge import IOJudge


class JudgeSessionIntegrationTests(TestCase):
    def setUp(self):
        self.client = docker.DockerClient()
        self.addCleanup(self.client.close)
        self.created = []
        collection_type = type(self.client.containers)
        create = collection_type.create

        def record_create(collection, **kwargs):
            container = create(collection, **kwargs)
            self.created.append(container)
            return container

        self.create_patch = patch.object(collection_type, "create", record_create)
        self.create_patch.start()
        self.addCleanup(self.create_patch.stop)

    def judge(self, language):
        judge = IOJudge(language)
        judge._client = self.client
        return judge

    def assert_containers(self, expected):
        self.assertEqual(len(self.created), expected)
        for container in self.created:
            with self.assertRaises(docker.errors.NotFound):
                container.reload()

    def test_cases_share_one_container_but_not_state(self):
        # Every case tries to leave state for the next one: files, a background
        # process, System V shared memory, and a tampered program.
        code = r'''
#include <cstdio>
#include <fstream>
#include <iostream>
#include <signal.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <unistd.h>
int main() {
  const char* paths[] = {"/tmp/marker", "/tmp/run/marker", "/dev/shm/marker", "/tmp/late"};
  for (auto p : paths) if (std::ifstream(p).good()) { std::cout << "leak " << p; return 0; }
  if (shmget(0x51a7e, 4096, 0) != -1) { std::cout << "leak shm"; return 0; }
  for (auto p : paths) std::ofstream(p) << "dirty";
  shmget(0x51a7e, 4096, IPC_CREAT | 0666);
  std::ofstream("/tmp/build/main") << "tampered";
  // Outlives the case: it must neither delay this case nor reach the next one.
  if (fork() == 0) { setsid(); signal(SIGHUP, SIG_IGN); sleep(30); std::ofstream("/tmp/late") << "x"; return 0; }
  int n; std::cin >> n; std::cout << n * 2;
}
'''
        with self.judge("cpp") as judge:
            results = list(judge.run(code, [("3", "6"), ("8", "16"), ("5", "10")], 3000, 256))
        self.assertEqual([r["status"] for r in results], ["AC"] * 3, results)
        self.assert_containers(1)

    def test_cases_cannot_read_later_inputs_or_forge_measurements(self):
        # The runner's stdin still holds the later inputs; GNU time's stderr
        # carries the memory report.
        code = r'''
#include <fstream>
#include <iostream>
#include <string>
#include <unistd.h>
int main() {
  std::string timer = std::to_string(getppid()), stat;
  std::getline(std::ifstream("/proc/" + timer + "/stat"), stat);
  std::string runner = std::to_string(std::stoi(stat.substr(stat.rfind(')') + 4)));
  for (auto fd : {"/proc/" + runner + "/fd/0", "/proc/" + timer + "/fd/2"})
    if (std::ifstream(fd).is_open()) { std::cout << "leak " << fd; return 0; }
  std::string line; std::cin >> line; std::cout << line;
}
'''
        with self.judge("cpp") as judge:
            results = list(judge.run(code, [("first", "first"), ("SECRET", "SECRET")], 1000, 256))
        self.assertEqual([r["status"] for r in results], ["AC", "AC"], results)
        self.assert_containers(1)

    def test_compilation_error_uses_one_container(self):
        with self.judge("cpp") as judge:
            result, = judge.run("this is invalid C++", [("", "")] * 2, 1000, 256)
        self.assertEqual(result["status"], "CE", result)
        self.assertTrue(result["error"])
        self.assert_containers(1)

    def test_other_code_does_not_reuse_the_build(self):
        with self.judge("c") as judge:
            for n in [1, 2]:
                code = f'#include <stdio.h>\nint main(){{printf("{n}");}}'
                result, = judge.run(code, [("", str(n))], 1000, 256)
                self.assertEqual(result["status"], "AC", result)
        self.assert_containers(2)

    def test_every_verdict_runs_in_one_container(self):
        code = '''#include <cstdio>
#include <unistd.h>
int main() { int n; scanf("%d", &n);
  if (n == 1) for (;;) {};
  if (n == 2) return 2;
  if (n == 4) for (;;) putchar('A');
  if (n == 5) sleep(10);
  printf("ok %d", n);
}'''
        cases = [("1", ""), ("2", ""), ("3", "wrong"), ("4", ""), ("5", ""), ("6", "ok 6")]
        with self.judge("cpp") as judge:
            results = list(judge.run(code, cases, 100, 256))
        self.assertEqual([r["status"] for r in results], ["TLE", "RE", "WA", "RE", "TLE", "AC"], results)
        self.assertEqual(results[3]["error"], "Output limit exceeded (1 MiB)")
        self.assert_containers(1)

    def test_other_cases_inputs_do_not_take_the_memory_limit(self):
        # 100 MB of inputs in all, yet each case can use 80 of its 128 MB.
        code = r'''
#include <iostream>
#include <string>
#include <vector>
int main() {
  std::string s; std::cin >> s;
  std::vector<char> block(80 << 20, 1);
  long touched = 0;
  for (size_t i = 0; i < block.size(); i += 4096) touched += block[i];
  std::cout << s.size() << " " << (touched > 0);
}
'''
        big_input = "7" * (1 << 20)
        with self.judge("cpp") as judge:
            results = list(judge.run(code, [(big_input, f"{1 << 20} 1")] * 100, 1000, 128))
        self.assertEqual({r["status"] for r in results}, {"AC"}, results[:1])
        self.assertEqual(len(results), 100)
        self.assert_containers(1)

    def test_many_cases_keep_their_order(self):
        code = "n = int(input())\nprint(n * n)"
        cases = [(str(n), str(n * n)) for n in range(50)]
        with self.judge("python") as judge:
            results = list(judge.run(code, cases, 1000, 128))
        self.assertEqual([r["output"] for r in results], [expected for _, expected in cases])
        self.assert_containers(1)

    def test_java_keeps_inner_classes_and_reports_missing_main(self):
        code = '''public class Main {
  static class Value { int get() { return 42; } }
  public static void main(String[] args) { System.out.println(new Value().get()); }
}'''
        with self.judge("java") as judge:
            results = list(judge.run(code, [("", "42")] * 2, 5000, 256))
            self.assertEqual([r["status"] for r in results], ["AC", "AC"], results)
            result, = judge.run("class Other {}", [("", "")], 5000, 256)
            self.assertEqual(result["status"], "RE", result)
        self.assert_containers(2)

    def test_python_cases_start_with_a_clean_tmp(self):
        code = 'from pathlib import Path\np=Path("/tmp/marker")\nassert not p.exists()\np.touch()\nprint(input())'
        with self.judge("python") as judge:
            results = list(judge.run(code, [("first", "first"), ("second", "second")], 1000, 128))
        self.assertEqual([r["status"] for r in results], ["AC", "AC"], results)
        self.assert_containers(1)
