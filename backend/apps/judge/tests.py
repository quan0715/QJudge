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

import unittest
from unittest.mock import patch
import docker.errors
from django.test import TestCase

from apps.judge.io_judge import IOJudge, _CE_SENTINEL


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_judge(language: str) -> IOJudge:
    return IOJudge(language)


# ---------------------------------------------------------------------------
# C++ integration tests  (real Docker)
# ---------------------------------------------------------------------------

class CppIntegrationTests(TestCase):
    """C++ 整合測試（需要 Docker + oj-judge image）"""

    def setUp(self):
        self.judge = IOJudge("cpp")

    def test_ac(self):
        code = "#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}"
        r = self.judge.execute(code, "3 4", "7", 1000, 128)
        self.assertEqual(r["status"], "AC")
        self.assertEqual(r["output"].strip(), "7")
        self.assertEqual(r["error"], "")

    def test_wa(self):
        code = "#include<iostream>\nint main(){std::cout<<0;}"
        r = self.judge.execute(code, "", "1", 1000, 128)
        self.assertEqual(r["status"], "WA")

    def test_ce(self):
        code = "#include<iostream>\nint main(){int a b;}"  # missing semicolon
        r = self.judge.execute(code, "", "", 1000, 128)
        self.assertEqual(r["status"], "CE")
        self.assertTrue(r["error"])  # g++ error message present

    def test_tle(self):
        code = "#include<iostream>\nint main(){while(1){}}"
        r = self.judge.execute(code, "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")
        self.assertIn("Time Limit Exceeded", r["error"])

    def test_re_abort(self):
        code = "#include<cstdlib>\nint main(){abort();}"
        r = self.judge.execute(code, "", "", 1000, 128)
        self.assertEqual(r["status"], "RE")

    def test_multiple_cases(self):
        code = "#include<iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b<<endl;}"
        for inp, exp in [("1 2", "3"), ("0 0", "0"), ("-1 1", "0")]:
            with self.subTest(input=inp):
                r = self.judge.execute(code, inp, exp, 1000, 128)
                self.assertEqual(r["status"], "AC", r)

    def test_whitespace_tolerance(self):
        code = "#include<iostream>\nint main(){std::cout<<42<<std::endl;}"
        r = self.judge.execute(code, "", "42\n", 1000, 128)
        self.assertEqual(r["status"], "AC")

    def test_unicode_output(self):
        code = '#include<iostream>\nint main(){std::cout<<"你好世界"<<std::endl;}'
        r = self.judge.execute(code, "", "你好世界", 1000, 128)
        self.assertIn(r["status"], ["AC", "WA", "RE"])  # at least no crash

    def test_mle(self):
        # Try to allocate 300 MB while limit is 128 MB
        code = "#include<vector>\nint main(){std::vector<int>v(75000000,1);}"
        r = self.judge.execute(code, "", "", 3000, 128)
        self.assertIn(r["status"], ["MLE", "RE", "SE"])

    def test_empty_input(self):
        code = '#include<iostream>\nint main(){std::cout<<"OK";}'
        r = self.judge.execute(code, "", "OK", 1000, 128)
        self.assertEqual(r["status"], "AC")

    def test_large_output_truncated(self):
        code = '#include<iostream>\nint main(){for(int i=0;i<10000;i++)std::cout<<"AAAA"<<std::endl;}'
        r = self.judge.execute(code, "", "DUMMY", 3000, 128)
        self.assertIn(r["status"], ["AC", "WA"])
        self.assertLessEqual(len(r["output"]), 1000)

    def test_fork_bomb_protection(self):
        code = "#include<unistd.h>\nint main(){while(1)fork();}"
        r = self.judge.execute(code, "", "", 2000, 128)
        self.assertIn(r["status"], ["RE", "TLE", "SE"])

    def test_time_measured(self):
        code = "#include<unistd.h>\nint main(){sleep(1);}"
        r = self.judge.execute(code, "", "", 3000, 128)
        self.assertEqual(r["status"], "AC")
        self.assertGreaterEqual(r["time"], 800)
        self.assertLessEqual(r["time"], 2500)

    def test_seccomp_allows_normal_exec(self):
        code = "#include<iostream>\nint main(){int s=0;for(int i=1;i<=5;i++)s+=i;std::cout<<s;}"
        r = self.judge.execute(code, "", "15", 2000, 128)
        self.assertEqual(r["status"], "AC")


# ---------------------------------------------------------------------------
# Python integration tests
# ---------------------------------------------------------------------------

class PythonIntegrationTests(TestCase):
    """Python 整合測試（需要 Docker + oj-judge image with python3）"""

    def setUp(self):
        self.judge = _make_judge("python")

    def test_ac(self):
        r = self.judge.execute("a,b=map(int,input().split())\nprint(a+b)", "3 4", "7", 2000, 128)
        self.assertEqual(r["status"], "AC")

    def test_wa(self):
        r = self.judge.execute("print(0)", "", "1", 2000, 128)
        self.assertEqual(r["status"], "WA")

    def test_re(self):
        r = self.judge.execute("print(1/0)", "", "", 2000, 128)
        self.assertEqual(r["status"], "RE")

    def test_tle(self):
        r = self.judge.execute("while True: pass", "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")

    def test_hello(self):
        r = self.judge.execute("print('Hello, World!')", "", "Hello, World!", 2000, 128)
        self.assertEqual(r["status"], "AC")


# ---------------------------------------------------------------------------
# C integration tests
# ---------------------------------------------------------------------------

class CIntegrationTests(TestCase):
    """C 整合測試（需要 Docker + oj-judge image with gcc）"""

    def setUp(self):
        self.judge = _make_judge("c")

    def test_ac(self):
        code = "#include<stdio.h>\nint main(){int a,b;scanf(\"%d %d\",&a,&b);printf(\"%d\\n\",a+b);}"
        r = self.judge.execute(code, "3 4", "7", 2000, 128)
        self.assertEqual(r["status"], "AC")

    def test_ce(self):
        code = "#include<stdio.h>\nint main(){int a b;}"
        r = self.judge.execute(code, "", "", 2000, 128)
        self.assertEqual(r["status"], "CE")

    def test_tle(self):
        code = "#include<stdio.h>\nint main(){while(1){}}"
        r = self.judge.execute(code, "", "", 500, 128)
        self.assertEqual(r["status"], "TLE")


# ---------------------------------------------------------------------------
# Java integration tests
# ---------------------------------------------------------------------------

class JavaIntegrationTests(TestCase):
    """Java 整合測試（需要 Docker + oj-judge image with openjdk-17）"""

    def setUp(self):
        self.judge = _make_judge("java")

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
        r = self.judge.execute(code, "3 4", "7", 5000, 256)
        self.assertEqual(r["status"], "AC")

    def test_ce(self):
        code = "public class Main { public static void main(String[] a) { int x = ; } }"
        r = self.judge.execute(code, "", "", 5000, 256)
        self.assertEqual(r["status"], "CE")

    def test_re(self):
        code = (
            "public class Main {\n"
            "    public static void main(String[] args) {\n"
            "        throw new RuntimeException(\"oops\");\n"
            "    }\n"
            "}"
        )
        r = self.judge.execute(code, "", "", 5000, 256)
        self.assertEqual(r["status"], "RE")


# ---------------------------------------------------------------------------
# Mock-based unit tests (no Docker needed)
# ---------------------------------------------------------------------------

class IOJudgeMockTests(TestCase):
    """IOJudge 單元測試（mock Docker，不需要真實 image）"""

    def _mock_judge(self, language: str = "cpp"):
        judge = IOJudge(language)
        judge._ensure_docker_client = lambda: None
        return judge

    def _set_run_result(self, judge, exit_code, output, time_ms=10, memory=4096):
        judge._run_in_container = lambda command, timeout, mem_limit: {
            "exit_code": exit_code,
            "output": output,
            "time": time_ms,
            "memory": memory,
        }

    def test_ac_verdict(self):
        judge = self._mock_judge()
        self._set_run_result(judge, 0, "42\n")
        r = judge.execute("", "", "42", 1000, 128)
        self.assertEqual(r["status"], "AC")
        self.assertEqual(r["error"], "")

    def test_wa_verdict(self):
        judge = self._mock_judge()
        self._set_run_result(judge, 0, "41\n")
        r = judge.execute("", "", "42", 1000, 128)
        self.assertEqual(r["status"], "WA")
        self.assertEqual(r["error"], "Wrong Answer")

    def test_tle_verdict(self):
        judge = self._mock_judge()
        self._set_run_result(judge, 124, "")
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "TLE")
        self.assertIn("Time Limit Exceeded", r["error"])

    def test_re_verdict(self):
        judge = self._mock_judge()
        self._set_run_result(judge, 137, "Segmentation fault")
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "RE")

    def test_ce_via_sentinel(self):
        """CE 由 shell sentinel 字串決定，不靠 exit code 猜測"""
        judge = self._mock_judge()
        self._set_run_result(judge, 1, f"{_CE_SENTINEL}\nmain.cpp:1:10: error: expected ';'")
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "CE")
        self.assertIn("error:", r["error"])

    def test_se_on_docker_unavailable(self):
        judge = IOJudge("cpp")
        judge._ensure_docker_client = lambda: (_ for _ in ()).throw(RuntimeError("Cannot connect"))
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")
        self.assertIn("Cannot connect", r["error"])

    def test_se_on_docker_api_error(self):
        judge = self._mock_judge()
        judge._run_in_container = lambda *_: (_ for _ in ()).throw(
            docker.errors.APIError("API Error")
        )
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")

    def test_se_response_has_all_fields(self):
        judge = IOJudge("python")
        judge._ensure_docker_client = lambda: (_ for _ in ()).throw(Exception("boom"))
        r = judge.execute("", "", "", 1000, 128)
        for key in ("status", "output", "error", "time", "memory"):
            self.assertIn(key, r)
        self.assertEqual(r["status"], "SE")
        self.assertEqual(r["output"], "")
        self.assertEqual(r["time"], 0)
        self.assertEqual(r["memory"], 0)

    def test_python_no_compile_cmd(self):
        """Python 不應有 compile 步驟"""
        judge = self._mock_judge("python")
        captured = {}

        def capture(command, timeout, mem_limit):
            captured["cmd"] = command
            return {"exit_code": 0, "output": "ok\n", "time": 5, "memory": 4096}

        judge._run_in_container = capture
        judge.execute("print('ok')", "", "ok", 1000, 128)
        self.assertNotIn("javac", captured["cmd"])
        self.assertNotIn("g++", captured["cmd"])
        self.assertNotIn("gcc", captured["cmd"])
        self.assertIn("python3", captured["cmd"])

    def test_java_uses_xmx(self):
        """Java run 指令應包含 -Xmx (memory limit)"""
        judge = self._mock_judge("java")
        captured = {}

        def capture(command, timeout, mem_limit):
            captured["cmd"] = command
            return {"exit_code": 0, "output": "ok\n", "time": 5, "memory": 4096}

        judge._run_in_container = capture
        judge.execute("", "", "ok", 5000, 256)
        self.assertIn("-Xmx256m", captured["cmd"])
        self.assertIn("javac", captured["cmd"])

    @patch.object(IOJudge, "_ensure_docker_client")
    def test_patch_io_judge_works(self, mock_ensure):
        """可以正常 patch IOJudge 的方法"""
        mock_ensure.side_effect = RuntimeError("no docker")
        judge = IOJudge("cpp")
        r = judge.execute("", "", "", 1000, 128)
        self.assertEqual(r["status"], "SE")
