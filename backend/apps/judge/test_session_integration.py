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
  // Holds stdout open: the case must still finish within its time limit.
  if (fork() == 0) { setsid(); signal(SIGHUP, SIG_IGN); sleep(30); std::ofstream("/tmp/late") << "x"; return 0; }
  int n; std::cin >> n; std::cout << n * 2;
}
'''
        with self.judge("cpp") as judge:
            for value, expected in [("3", "6"), ("8", "16"), ("5", "10")]:
                result = judge.execute(code, value, expected, 3000, 256)
                self.assertEqual(result["status"], "AC", result)
        self.assert_containers(1)

    def test_compilation_error_uses_one_container(self):
        with self.judge("cpp") as judge:
            for _ in range(2):
                result = judge.execute("this is invalid C++", "", "", 1000, 256)
                self.assertEqual(result["status"], "CE", result)
                self.assertTrue(result["error"])
        self.assert_containers(1)

    def test_other_code_does_not_reuse_the_build(self):
        with self.judge("c") as judge:
            for n in [1, 2]:
                code = f'#include <stdio.h>\nint main(){{printf("{n}");}}'
                result = judge.execute(code, "", str(n), 1000, 256)
                self.assertEqual(result["status"], "AC", result)
        self.assert_containers(2)

    def test_runtime_verdicts_keep_the_container(self):
        code = '''#include <cstdio>
int main() { int n; scanf("%d", &n);
  if (n == 1) for (;;) {};
  if (n == 2) return 2;
  puts("ok");
}'''
        with self.judge("cpp") as judge:
            for value, expected, status in [("1", "", "TLE"), ("2", "", "RE"),
                                            ("3", "wrong", "WA"), ("3", "ok", "AC")]:
                result = judge.execute(code, value, expected, 100, 256)
                self.assertEqual(result["status"], status, result)
        self.assert_containers(1)

    def test_output_limit_restarts_the_container_for_later_cases(self):
        code = '''#include <cstdio>
int main() { int n; scanf("%d", &n); if (n == 1) for (;;) putchar('A'); puts("ok"); }'''
        with self.judge("cpp") as judge:
            for value, status in [("1", "RE"), ("2", "AC")]:
                result = judge.execute(code, value, "ok", 2000, 256)
                self.assertEqual(result["status"], status, result)
        self.assert_containers(2)

    def test_java_keeps_inner_classes_and_reports_missing_main(self):
        code = '''public class Main {
  static class Value { int get() { return 42; } }
  public static void main(String[] args) { System.out.println(new Value().get()); }
}'''
        with self.judge("java") as judge:
            for _ in range(2):
                result = judge.execute(code, "", "42", 5000, 256)
                self.assertEqual(result["status"], "AC", result)
        with self.judge("java") as judge:
            result = judge.execute("class Other {}", "", "", 5000, 256)
            self.assertEqual(result["status"], "RE", result)
        self.assert_containers(2)

    def test_python_cases_start_with_a_clean_tmp(self):
        code = 'from pathlib import Path\np=Path("/tmp/marker")\nassert not p.exists()\np.touch()\nprint(input())'
        with self.judge("python") as judge:
            for value in ["first", "second"]:
                result = judge.execute(code, value, value, 1000, 128)
                self.assertEqual(result["status"], "AC", result)
        self.assert_containers(1)
