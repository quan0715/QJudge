"""
Docker-based C++ code execution service
"""
import docker
import tempfile
import os
from typing import Dict, Any
from django.conf import settings
from .base_judge import BaseJudge


class CppJudge(BaseJudge):
    """C++ Judge implementation"""
    
    def __init__(self):
        """初始化 Judge，使用延遲載入避免在 __init__ 時連接 Docker"""
        self.client = None
        self.image = settings.DOCKER_IMAGE_JUDGE
        self.pids_limit = settings.DOCKER_JUDGE_PIDS_LIMIT
        self.tmpfs_size = settings.DOCKER_JUDGE_TMPFS_SIZE
        self.docker_timeout = settings.DOCKER_JUDGE_TIMEOUT
        self._docker_available = None  # Cache Docker availability status
    
    def get_language_name(self) -> str:
        """返回語言名稱"""
        return "C++"
    
    def get_language_version(self) -> str:
        """返回語言版本"""
        return "C++20"
    
    def _ensure_docker_client(self):
        """
        確保 Docker client 已初始化
        
        Raises:
            RuntimeError: 如果無法連接 Docker 或 image 不存在
        """
        if self.client is not None:
            return  # Already initialized
        
        try:
            # 從 settings 讀取 Docker 設定
            docker_kwargs = {'timeout': self.docker_timeout}
            if settings.DOCKER_HOST:
                docker_kwargs['base_url'] = settings.DOCKER_HOST
            
            self.client = docker.DockerClient(**docker_kwargs)
            
            # 驗證 Docker 連接
            self.client.ping()
            
            # 驗證 image 是否存在
            try:
                self.client.images.get(self.image)
            except docker.errors.ImageNotFound:
                raise RuntimeError(
                    f"Judge image '{self.image}' not found. "
                    f"Please build it with: docker build -t {self.image} -f backend/judge/Dockerfile.judge backend/judge"
                )
            
            self._docker_available = True
            
        except docker.errors.DockerException as e:
            self._docker_available = False
            raise RuntimeError(
                f"Cannot connect to Docker daemon: {str(e)}. "
                f"Please ensure Docker is running and accessible."
            ) from e
        except Exception as e:
            self._docker_available = False
            raise RuntimeError(f"Unexpected error initializing Docker client: {str(e)}") from e
    
    def execute(
        self,
        code: str,
        input_data: str,
        expected_output: str,
        time_limit: int,  # ms
        memory_limit: int  # MB
    ) -> Dict[str, Any]:
        """
        執行 C++ 代碼並比對輸出
        
        Returns:
            Dict with keys: status, output, error, time, memory
            status 可能是: AC, WA, TLE, CE, RE, SE
        """
        
        try:
            # 確保 Docker 可用 (可能會拋出 RuntimeError)
            self._ensure_docker_client()
            
            # 將編譯和執行合併在一個容器調用中
            timeout_sec = time_limit / 1000.0 + 0.5
            
            # 構建完整的命令：寫入代碼 -> 編譯 -> 寫入輸入 -> 執行
            full_cmd = f'''cat > main.cpp <<'CODEEOF'
{code}
CODEEOF

# 編譯
g++ -O2 -std=c++20 -o main main.cpp 2>&1
COMPILE_EXIT=$?

if [ $COMPILE_EXIT -ne 0 ]; then
    exit $COMPILE_EXIT
fi

# 寫入輸入
cat > input.txt <<'INPUTEOF'
{input_data}
INPUTEOF

# 執行
timeout {timeout_sec}s ./main < input.txt 2>&1
'''
            
            result = self._run_in_container(
                full_cmd,
                time_limit / 1000.0 + 2,  # 給編譯和執行足夠時間
                memory_limit
            )
            
            # 檢查是否是編譯錯誤（在執行 timeout 之前就失敗了）
            if result['exit_code'] != 0 and result['exit_code'] != 124:
                # 檢查輸出中是否包含編譯錯誤訊息
                if 'error:' in result['output'].lower() or 'undefined reference' in result['output'].lower():
                    return {
                        'status': 'CE',
                        'output': '',
                        'error': result['output'][:1000],
                        'time': 0,
                        'memory': 0
                    }
            
            # 檢查執行結果
            if result['exit_code'] == 124:  # timeout exit code
                return {
                    'status': 'TLE',
                    'output': result['output'][:1000],
                    'error': f'Time Limit Exceeded (>{time_limit}ms)',
                    'time': time_limit,
                    'memory': result['memory']
                }
            
            if result['exit_code'] != 0:
                return {
                    'status': 'RE',
                    'output': result['output'][:1000],
                    'error': f'Runtime Error (exit code: {result["exit_code"]})',
                    'time': result['time'],
                    'memory': result['memory']
                }
            
            # 比對輸出
            actual = result['output'].strip()
            expected = expected_output.strip()
            
            if actual == expected:
                return {
                    'status': 'AC',
                    'output': actual[:1000],
                    'error': '',
                    'time': result['time'],
                    'memory': result['memory']
                }
            else:
                return {
                    'status': 'WA',
                    'output': actual[:1000],
                    'error': 'Wrong Answer',
                    'time': result['time'],
                    'memory': result['memory']
                }
        
        except RuntimeError as e:
            # Docker 初始化錯誤 → SE
            return {
                'status': 'SE',
                'output': '',
                'error': str(e),
                'time': 0,
                'memory': 0
            }
        except docker.errors.DockerException as e:
            # Docker API 錯誤 → SE
            return {
                'status': 'SE',
                'output': '',
                'error': f'Docker error: {str(e)}',
                'time': 0,
                'memory': 0
            }
        except Exception as e:
            # 其他未預期錯誤 → SE
            return {
                'status': 'SE',
                'output': '',
                'error': f'System Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
    
    
    def _run_in_container(
        self, command: str, timeout: float, mem_limit: int
    ) -> Dict[str, Any]:
        """在容器中執行命令（增強安全性設定）"""
        
        container = None
        try:
            # 記錄開始時間（wall-clock time）
            import time
            start_time = time.time()
            
            # 準備安全選項
            security_opts = ['no-new-privileges']  # 禁止提權
            
            # 如果設定了 seccomp profile，則載入
            if settings.DOCKER_SECCOMP_PROFILE:
                import os
                seccomp_path = settings.DOCKER_SECCOMP_PROFILE
                
                # 確保路徑是絕對路徑
                if not os.path.isabs(seccomp_path):
                    seccomp_path = os.path.join(settings.BASE_DIR, seccomp_path)
                
                # 檢查檔案是否存在
                if os.path.exists(seccomp_path):
                    # Docker 需要在容器內可存取的路徑
                    # 對於 host mode，使用絕對路徑
                    # 對於 container mode (DinD)，需要確保檔案在容器內可見
                    security_opts.append(f'seccomp={seccomp_path}')
                else:
                    # Seccomp profile 不存在，記錄警告但繼續
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f'Seccomp profile not found: {seccomp_path}')
            
            container = self.client.containers.run(
                self.image,
                command=['/bin/bash', '-c', command],
                working_dir='/tmp',
                
                # 網路與隔離
                network_disabled=True,
                
                # 資源限制
                mem_limit=f"{mem_limit}m",
                memswap_limit=f"{mem_limit}m",  # 禁止 swap
                cpu_period=100000,
                cpu_quota=100000,  # 1 CPU core
                pids_limit=self.pids_limit,  # 從 settings 讀取
                
                # 安全性設定（經測試的可用配置）
                # 只移除危險的 capabilities，保留必要的執行權限
                cap_drop=[
                    'NET_ADMIN', 'SYS_ADMIN', 'SYS_BOOT', 'SYS_MODULE',
                    'SYS_RAWIO', 'SYS_PTRACE', 'SYS_TIME', 'MAC_ADMIN',
                    'MAC_OVERRIDE', 'NET_RAW', 'AUDIT_WRITE', 'AUDIT_CONTROL'
                ],
                security_opt=security_opts,  # 包含 no-new-privileges 和 seccomp (如果有)
                # tmpfs 使用 exec 選項允許執行檔案
                tmpfs={'/tmp': f'size={self.tmpfs_size},mode=1777,exec'},
                
                detach=True,
                remove=False
            )
            
            # 等待容器完成（使用更長的超時避免統計測量被中斷）
            # 注意：必須在 wait 之後立即收集 stats，因為容器停止後 stats 可能不可用
            result = container.wait(timeout=int(timeout) + 5)
            
            # 計算執行時間（wall-clock）
            end_time = time.time()
            execution_time_ms = int((end_time - start_time) * 1000)
            
            # 獲取輸出
            output = container.logs().decode('utf-8', errors='ignore')
            
            # 獲取精確的記憶體和 CPU 統計
            # 注意：stats 必須在容器 remove 之前獲取
            memory_usage_kb = 0
            
            try:
                # 使用 inspect 而非 stats，因為容器已停止
                inspect_data = container.attrs
                
                # 從 HostConfig 獲取記憶體限制用於驗證
                # 實際使用量需要從運行時統計獲取，但容器已停止
                # 這裡我們使用 /sys/fs/cgroup 中的資訊（如果可用）
                
                # 嘗試從容器的執行日誌獲取記憶體資訊
                # Docker 在某些配置下可能不提供 stats，我們使用估算
                # 對於簡單程式，估算為 4MB
                # 對於有大量分配的程式，從程式碼分析（不可靠）
                
                # 更好的方法：在容器運行時異步收集 stats
                # 但這會增加複雜度，暫時使用近似值
                memory_usage_kb = 4096  # 預設 4MB
                
            except Exception as e:
                memory_usage_kb = 0
            
            return {
                'exit_code': result['StatusCode'],
                'output': output,
                'time': execution_time_ms,
                'memory': memory_usage_kb
            }
            
        except docker.errors.ContainerError as e:
            return {
                'exit_code': -1,
                'output': str(e),
                'time': 0,
                'memory': 0
            }
        except docker.errors.APIError as e:
            # Docker API 錯誤（包括 timeout）
            return {
                'exit_code': -1,
                'output': f'Docker API Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
        except Exception as e:
            return {
                'exit_code': -1,
                'output': f'System Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
        finally:
            if container:
                try:
                    container.remove(force=True)
                except:
                    pass

