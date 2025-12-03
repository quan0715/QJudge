"""
Docker-based Python code execution service
"""
import docker
from typing import Dict, Any
from django.conf import settings
from .base_judge import BaseJudge


class PythonJudge(BaseJudge):
    """Python Judge implementation"""
    
    def __init__(self):
        """初始化 Python Judge"""
        self.client = None
        self.image = 'python:3.11-slim'  # Python judge image
        self.pids_limit = settings.DOCKER_JUDGE_PIDS_LIMIT
        self.tmpfs_size = settings.DOCKER_JUDGE_TMPFS_SIZE
        self.docker_timeout = settings.DOCKER_JUDGE_TIMEOUT
        self._docker_available = None
    
    def get_language_name(self) -> str:
        """返回語言名稱"""
        return "Python"
    
    def get_language_version(self) -> str:
        """返回語言版本"""
        return "Python 3.11"
    
    def _ensure_docker_client(self):
        """確保 Docker client 已初始化"""
        if self.client is not None:
            return
        
        try:
            docker_kwargs = {'timeout': self.docker_timeout}
            if settings.DOCKER_HOST:
                docker_kwargs['base_url'] = settings.DOCKER_HOST
            
            self.client = docker.DockerClient(**docker_kwargs)
            self.client.ping()
            
            self._docker_available = True
            
        except docker.errors.DockerException as e:
            self._docker_available = False
            raise RuntimeError(f"Cannot connect to Docker: {e}") from e
    
    def execute(
        self,
        code: str,
        input_data: str,
        expected_output: str,
        time_limit: int,
        memory_limit: int
    ) -> Dict[str, Any]:
        """
        執行 Python 代碼並比對輸出
        
        Returns:
            Dict with keys: status, output, error, time, memory
        """
        try:
            self._ensure_docker_client()
            
            # Python 不需要編譯，直接執行
            import time
            start_time = time.time()
            
            # 準備安全選項
            security_opts = ['no-new-privileges']
            
            container = self.client.containers.run(
                self.image,
                command=['python3', '-c', code],
                stdin_open=True,
                network_disabled=True,
                mem_limit=f"{memory_limit}m",
                memswap_limit=f"{memory_limit}m",
                cpu_period=100000,
                cpu_quota=100000,
                pids_limit=self.pids_limit,
                cap_drop=[
                    'NET_ADMIN', 'SYS_ADMIN', 'SYS_BOOT', 'SYS_MODULE',
                    'SYS_RAWIO', 'SYS_PTRACE', 'SYS_TIME', 'MAC_ADMIN',
                    'MAC_OVERRIDE', 'NET_RAW', 'AUDIT_WRITE', 'AUDIT_CONTROL'
                ],
                security_opt=security_opts,
                detach=True,
                remove=False
            )
            
            # 如果有輸入，提供給程式
            if input_data:
                container.attach_socket()
            
            # 計算 timeout（秒）
            timeout_sec = time_limit / 1000.0 + 0.5
            result = container.wait(timeout=int(timeout_sec) + 5)
            
            end_time = time.time()
            execution_time_ms = int((end_time - start_time) * 1000)
            
            output = container.logs().decode('utf-8', errors='ignore')
            
            # 記憶體統計（簡化版）
            memory_usage_kb = 4096  # 預設估算
            
            # 清理容器
            try:
                container.remove(force=True)
            except:
                pass
            
            # 判斷執行結果
            if result['StatusCode'] == 124:  # timeout
                return {
                    'status': 'TLE',
                    'output': output[:1000],
                    'error': f'Time Limit Exceeded (>{time_limit}ms)',
                    'time': time_limit,
                    'memory': memory_usage_kb
                }
            
            if result['StatusCode'] != 0:
                return {
                    'status': 'RE',
                    'output': output[:1000],
                    'error': f'Runtime Error (exit code: {result["StatusCode"]})',
                    'time': execution_time_ms,
                    'memory': memory_usage_kb
                }
            
            # 比對輸出
            actual = output.strip()
            expected = expected_output.strip()
            
            if actual == expected:
                return {
                    'status': 'AC',
                    'output': actual[:1000],
                    'error': '',
                    'time': execution_time_ms,
                    'memory': memory_usage_kb
                }
            else:
                return {
                    'status': 'WA',
                    'output': actual[:1000],
                    'error': 'Wrong Answer',
                    'time': execution_time_ms,
                    'memory': memory_usage_kb
                }
        
        except RuntimeError as e:
            return {
                'status': 'SE',
                'output': '',
                'error': str(e),
                'time': 0,
                'memory': 0
            }
        except Exception as e:
            return {
                'status': 'SE',
                'output': '',
                'error': f'System Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
