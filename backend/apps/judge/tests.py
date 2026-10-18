"""
判題系統整合測試（需要 Docker）

執行方式：
    docker exec oj_backend_dev python manage.py test apps.judge --verbosity=2
    docker exec oj_backend_dev python manage.py test apps.judge.tests.CppIntegrationTests
    docker exec oj_backend_dev python manage.py test apps.judge.tests.PythonIntegrationTests
    docker exec oj_backend_dev python manage.py test apps.judge.tests.JavaIntegrationTests
    docker exec oj_backend_dev python manage.py test apps.judge.tests.CIntegrationTests
    docker exec oj_backend_dev python manage.py test apps.judge.tests.IOJudgeMockTests
"""

import shlex
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

import docker
from django.conf import settings

from apps.judge.io_judge import IOJudge, _LANG_SPECS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_judge(language: str) -> IOJudge:
    return IOJudge(language)


def judge_one(judge, code, input_data, expected_output, time_limit, memory_limit):
    return next(judge.run(code, [(input_data, expected_output)], time_limit, memory_limit))


# ---------------------------------------------------------------------------
# C++ integration tests  (real Docker)
# ---------------------------------------------------------------------------

class CppIntegrationTests(TestCase):
    """C++ 整合測試（需要 Docker + oj-judge image）"""

    def setUp(self):
        self.judge = IOJudge("cpp")
        self.addCleanup(self.judge.close)

    def test_ac(self):
        code = "#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}"
        r = judge_one(self.judge, code, "3 4", "7", 1000, 128)
        self.assertEqual(r["status"], "AC")
        self.assertEqual(r["output"].strip(), "7")
        self.assertEqual(r["error"], "")

    def test_wa(self):
        code = "#include<iostream>\nint main(){std::cout<<0;}"
        r = judge_one(self.judge, code, "", "1", 1000, 128)
        self.assertEqual(r["status"], "WA")

    def test_ce(self):
        code = "#include<iostream>\nint main(){int a b;}"  # missing semicolon
        r = judge_one(self.judge, code, "", "", 1000, 128)
        self.assertEqual(r["status"], "CE")
        self.assertTrue(r["error"])  # g++ error message present

    def test_tle(self):
        code = "#include<iostream>\nint main(){while(1){}}"
        r = judge_one(self.judge, code, "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")
        self.assertIn("Time Limit Exceeded", r["error"])
        self.assertGreater(r["time"], 500)

    def test_re_abort(self):
        code = "#include<cstdlib>\nint main(){abort();}"
        r = judge_one(self.judge, code, "", "", 1000, 128)
        self.assertEqual(r["status"], "RE")

    def test_multiple_cases(self):
        code = "#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}"
        cases = [("1 2", "3"), ("0 0", "0"), ("-1 1", "0")]
        results = list(self.judge.run(code, cases, 1000, 128))
        self.assertEqual([r["output"] for r in results], ["3", "0", "0"], results)
        self.assertEqual({r["status"] for r in results}, {"AC"})

    def test_whitespace_tolerance(self):
        code = "#include<iostream>\nint main(){std::cout<<42<<std::endl;}"
        r = judge_one(self.judge, code, "", "42\n", 1000, 128)
        self.assertEqual(r["status"], "AC")

    def test_unicode_output(self):
        code = '#include<iostream>\nint main(){std::cout<<"你好世界"<<std::endl;}'
        r = judge_one(self.judge, code, "", "你好世界", 1000, 128)
        self.assertEqual(r["status"], "AC")

    def test_mle(self):
        # Try to allocate 300 MB while limit is 128 MB
        code = "#include<vector>\nint main(){std::vector<int>v(75000000,1);}"
        r = judge_one(self.judge, code, "", "", 3000, 128)
        self.assertIn(r["status"], ["MLE", "RE"])

    def test_bits_stdcpp_compiles_for_a_128mb_problem(self):
        # The second program cannot use the precompiled header: g++ needs
        # about 210 MiB for it, beyond the problem's limit but within the
        # compile budget.
        body = "using namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b;}"
        for code in ["#include <bits/stdc++.h>\n" + body, "#include <cstdio>\n#include <bits/stdc++.h>\n" + body]:
            with self.subTest(code=code[:30]):
                r = judge_one(self.judge, code, "3 4", "7", 1000, 128)
                self.assertEqual(r["status"], "AC", r)

    def test_compile_budget_and_timeout_stop_template_bombs(self):
        code = (
            "template<int D, long I> struct T { static const long v = T<D-1, 2*I>::v + T<D-1, 2*I+1>::v; };\n"
            "template<long I> struct T<0, I> { static const long v = I; };\n"
            "int main(){ return T<26, 0>::v; }"
        )
        for limit, value, error in [
            ("_COMPILE_MEMORY_MB", 256, "Killed signal terminated program cc1plus"),
            ("_COMPILE_TIMEOUT_SECONDS", 2, "Compilation time limit exceeded"),
        ]:
            with self.subTest(limit=limit), patch(f"apps.judge.io_judge.{limit}", value):
                r = judge_one(self.judge, code, "", "", 1000, 128)
                self.assertEqual(r["status"], "CE", r)
                self.assertIn(error, r["error"])

    def test_compile_command_uses_the_precompiled_header(self):
        # g++ silently ignores a precompiled header built with other flags.
        script = (
            "cd /tmp && printf '#include <bits/stdc++.h>\\nint main(){}\\n' > main.cpp && "
            + shlex.join([*_LANG_SPECS["cpp"].compile_cmd, "-H"]) + " 2>&1"
        )
        client = docker.from_env()
        self.addCleanup(client.close)
        output = client.containers.run(
            settings.DOCKER_IMAGE_JUDGE, ["sh", "-c", script],
            platform=settings.DOCKER_JUDGE_PLATFORM, remove=True,
        ).decode()
        # "!" marks a precompiled header g++ used, "x" one it rejected.
        headers = [line for line in output.splitlines() if line.endswith("/bits/stdc++.h.gch")]
        self.assertEqual([line[0] for line in headers], ["!"], headers)

    def test_empty_input(self):
        code = '#include<iostream>\nint main(){std::cout<<"OK";}'
        r = judge_one(self.judge, code, "", "OK", 1000, 128)
        self.assertEqual(r["status"], "AC")

    def test_large_output_truncated(self):
        code = '#include<iostream>\nint main(){for(int i=0;i<10000;i++)std::cout<<"AAAA"<<std::endl;}'
        r = judge_one(self.judge, code, "", "DUMMY", 3000, 128)
        self.assertEqual(r["status"], "WA")
        self.assertLessEqual(len(r["output"]), 1000)

    def test_fork_bomb_protection(self):
        code = '#include<cstdio>\n#include<unistd.h>\nint main(){int n;scanf("%d",&n);if(n)while(1)fork();puts("ok");}'
        bomb, after = self.judge.run(code, [("1", ""), ("0", "ok")], 2000, 128)
        self.assertIn(bomb["status"], ["RE", "TLE"])
        self.assertEqual(after["status"], "AC", after)

    def test_time_is_cpu_time(self):
        code = "#include<unistd.h>\nint main(){sleep(1);}"
        r = judge_one(self.judge, code, "", "", 500, 128)
        self.assertEqual(r["status"], "AC", r)
        self.assertLess(r["time"], 200)

    def test_cpu_time_counts_children_the_program_never_waits_for(self):
        # The parent only reads the worker's answer and exits without waiting.
        code = r'''#include<cstdio>
#include<unistd.h>
int main(){int p[2];pipe(p);
if(fork()==0){volatile unsigned long long x=0;for(unsigned long long i=0;i<1500000000ULL;i++)x+=i;
long long r=42;write(p[1],&r,8);_exit(0);}
long long r;read(p[0],&r,8);printf("%lld",r);}'''
        r = judge_one(self.judge, code, "", "42", 300, 128)
        self.assertEqual(r["status"], "TLE", r)

    def test_wall_clock_limit_catches_sleeping_programs(self):
        code = "#include<unistd.h>\nint main(){sleep(5);}"
        r = judge_one(self.judge, code, "", "", 500, 128)
        self.assertEqual(r["status"], "TLE", r)

    def test_seccomp_allows_normal_exec(self):
        code = "#include<iostream>\nint main(){int s=0;for(int i=1;i<=5;i++)s+=i;std::cout<<s;}"
        r = judge_one(self.judge, code, "", "15", 2000, 128)
        self.assertEqual(r["status"], "AC")


# ---------------------------------------------------------------------------
# Python integration tests
# ---------------------------------------------------------------------------

class PythonIntegrationTests(TestCase):
    """Python 整合測試（需要 Docker + oj-judge image with python3）"""

    def setUp(self):
        self.judge = _make_judge("python")
        self.addCleanup(self.judge.close)

    def test_ac(self):
        r = judge_one(self.judge, "a,b=map(int,input().split())\nprint(a+b)", "3 4", "7", 2000, 128)
        self.assertEqual(r["status"], "AC")

    def test_wa(self):
        r = judge_one(self.judge, "print(0)", "", "1", 2000, 128)
        self.assertEqual(r["status"], "WA")

    def test_re(self):
        r = judge_one(self.judge, "print(1/0)", "", "", 2000, 128)
        self.assertEqual(r["status"], "RE")

    def test_tle(self):
        r = judge_one(self.judge, "while True: pass", "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")

    def test_hello(self):
        r = judge_one(self.judge, "print('Hello, World!')", "", "Hello, World!", 2000, 128)
        self.assertEqual(r["status"], "AC")


# ---------------------------------------------------------------------------
# C integration tests
# ---------------------------------------------------------------------------

class CIntegrationTests(TestCase):
    """C 整合測試（需要 Docker + oj-judge image with gcc）"""

    def setUp(self):
        self.judge = _make_judge("c")
        self.addCleanup(self.judge.close)

    def test_ac(self):
        code = "#include<stdio.h>\nint main(){int a,b;scanf(\"%d %d\",&a,&b);printf(\"%d\\n\",a+b);}"
        r = judge_one(self.judge, code, "3 4", "7", 2000, 128)
        self.assertEqual(r["status"], "AC")

    def test_ce(self):
        code = "#include<stdio.h>\nint main(){int a b;}"
        r = judge_one(self.judge, code, "", "", 2000, 128)
        self.assertEqual(r["status"], "CE")

    def test_tle(self):
        code = "#include<stdio.h>\nint main(){while(1){}}"
        r = judge_one(self.judge, code, "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")


# ---------------------------------------------------------------------------
# Java integration tests
# ---------------------------------------------------------------------------

class JavaIntegrationTests(TestCase):
    """Java 整合測試（需要 Docker + oj-judge image with openjdk-17）"""

    def setUp(self):
        self.judge = _make_judge("java")
        self.addCleanup(self.judge.close)

    def test_ac(self):
        code = (
            "import java.util.Scanner;\n"
            "public class Main {\n"
            "    public static void main(String[] args) {\n"
            "        Scanner sc = new Scanner(System.in);\n"
            "        int a = sc.nextInt(), b = sc.nextInt();\n"
            "        System.out.println(a + b);\n"
            "    }\n"
            "}"
        )
        r = judge_one(self.judge, code, "3 4", "7", 5000, 256)
        self.assertEqual(r["status"], "AC")

    def test_ce(self):
        code = "public class Main { public static void main(String[] a) { int x = ; } }"
        r = judge_one(self.judge, code, "", "", 5000, 256)
        self.assertEqual(r["status"], "CE")

    def test_re(self):
        code = (
            "public class Main {\n"
            "    public static void main(String[] args) {\n"
            "        throw new RuntimeException(\"oops\");\n"
            "    }\n"
            "}"
        )
        r = judge_one(self.judge, code, "", "", 5000, 256)
        self.assertEqual(r["status"], "RE")


# ---------------------------------------------------------------------------
# Mock-based unit tests (no Docker needed)
# ---------------------------------------------------------------------------

BUILT = {"exit": 0, "timeout": False, "ole": False, "output": ""}


class IOJudgeMockTests(TestCase):
    """IOJudge 單元測試（mock Docker，不需要真實 image）"""

    def _mock_judge(self, records, language: str = "cpp"):
        judge = IOJudge(language)
        judge._ensure_docker_client = lambda: None
        judge._start_container = lambda memory_limit: SimpleNamespace(remove=lambda **kwargs: None)
        judge._records = lambda *args: (record for record in records)
        return judge

    def _verdict(self, expected_output, **record):
        case = {"exit": 0, "time": 10, "memory": 4096, "tle": False, "ole": False, "output": "", **record}
        return judge_one(self._mock_judge([BUILT, case]), "", "", expected_output, 1000, 128)

    def test_ac_verdict(self):
        r = self._verdict("42", output="42\n")
        self.assertEqual(r["status"], "AC")
        self.assertEqual(r["error"], "")

    def test_wa_verdict(self):
        r = self._verdict("42", output="41\n")
        self.assertEqual(r["status"], "WA")
        self.assertEqual(r["error"], "Wrong Answer")

    def test_tle_verdict(self):
        r = self._verdict("", tle=True, exit=137, time=1003)
        self.assertEqual(r["status"], "TLE")
        self.assertIn("Time Limit Exceeded", r["error"])
        self.assertEqual(r["time"], 1003)

    def test_re_verdict(self):
        r = self._verdict("", exit=139, output="Segmentation fault")
        self.assertEqual(r["status"], "RE")
        self.assertIn("139", r["error"])

    def test_output_limit_verdict(self):
        r = self._verdict("", ole=True, exit=153, output="A" * 5000)
        self.assertEqual(r["status"], "RE")
        self.assertEqual(r["error"], "Output limit exceeded (1 MiB)")
        self.assertEqual(len(r["output"]), 1000)

    def test_ce_comes_from_the_build_record(self):
        judge = self._mock_judge([{**BUILT, "exit": 1, "output": "main.cpp:1:10: error: expected ';'"}])
        r = judge_one(judge, "", "", "", 1000, 128)
        self.assertEqual(r["status"], "CE")
        self.assertIn("error:", r["error"])

    def test_se_on_docker_unavailable(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: (_ for _ in ()).throw(
            RuntimeError("docker-host-secret")
        )
        r = judge_one(judge, "", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")
        self.assertEqual(r["error"], "Judge system error")
        self.assertNotIn("secret", str(r))

    def test_se_on_docker_api_error(self):
        judge = self._mock_judge([])
        judge._records = lambda *args: (_ for _ in ()).throw(
            docker.errors.APIError("API Error")
        )
        r = judge_one(judge, "", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")

    def test_se_response_has_all_fields(self):
        judge = IOJudge("python")
        judge._ensure_docker_client = lambda: (_ for _ in ()).throw(
            Exception("judge-runtime-secret")
        )
        r = judge_one(judge, "", "", "", 1000, 128)
        for key in ("status", "output", "error", "time", "memory"):
            self.assertIn(key, r)
        self.assertEqual(r["status"], "SE")
        self.assertEqual(r["output"], "")
        self.assertEqual(r["error"], "Judge system error")
        self.assertNotIn("secret", str(r))
        self.assertEqual(r["time"], 0)
        self.assertEqual(r["memory"], 0)

    def test_container_api_failure_does_not_expose_exception_details(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: None
        judge._client = SimpleNamespace(
            containers=SimpleNamespace(
                create=lambda **_kwargs: (_ for _ in ()).throw(
                    docker.errors.APIError("docker-api-secret")
                )
            )
        )

        result = judge_one(judge, "int main(){}", "", "", 1000, 64)

        self.assertEqual(result["status"], "SE")
        self.assertNotIn("secret", str(result))

    def test_container_runtime_failure_does_not_expose_exception_details(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: None
        judge._client = SimpleNamespace(
            containers=SimpleNamespace(
                create=lambda **_kwargs: (_ for _ in ()).throw(
                    ValueError("container-runtime-secret")
                )
            )
        )

        result = judge_one(judge, "int main(){}", "", "", 1000, 64)

        self.assertEqual(result["status"], "SE")
        self.assertNotIn("secret", str(result))

    @patch.object(IOJudge, "_ensure_docker_client")
    def test_patch_io_judge_works(self, mock_ensure):
        """可以正常 patch IOJudge 的方法"""
        mock_ensure.side_effect = RuntimeError("no docker")
        judge = IOJudge("cpp")
        r = judge_one(judge, "", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")
