"""
Standalone Judge Worker Script
------------------------------
這個腳本展示了如何將 Judge Worker 作為獨立微服務運行，
完全脫離 Django 的依賴（除了 settings 配置）。

這實現了「長期計劃」中的微服務化與水平擴展。
你可以將此腳本部署在任何有 Docker 的機器上。
"""

import os
import sys
import time
import json
import logging
from concurrent.futures import ThreadPoolExecutor

# 模擬 Django settings (如果不想依賴 Django)
# 在真實微服務中，這裡會從環境變數或 Config Server 讀取
class MockSettings:
    DOCKER_HOST = os.getenv('DOCKER_HOST', None)
    DOCKER_IMAGE_JUDGE = os.getenv('DOCKER_IMAGE_JUDGE', 'oj-judge:latest')
    DOCKER_JUDGE_PIDS_LIMIT = int(os.getenv('DOCKER_JUDGE_PIDS_LIMIT', '64'))
    DOCKER_JUDGE_TMPFS_SIZE = os.getenv('DOCKER_JUDGE_TMPFS_SIZE', '100M')
    DOCKER_JUDGE_TIMEOUT = int(os.getenv('DOCKER_JUDGE_TIMEOUT', '60'))
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DOCKER_SECCOMP_PROFILE = None  # 簡化演示

# Setup paths
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('JudgeWorker')

def run_worker(worker_id):
    """模擬 Worker 監聽任務"""
    logger.info(f"Worker {worker_id} started, waiting for tasks...")
    
    # 在真實場景中，這裡會連接 Redis/RabbitMQ
    # 這裡我們模擬處理一個任務
    
    from apps.judge.judge_factory import get_judge
    
    # 模擬接收到的任務數據
    task = {
        'id': 'submission_123',
        'language': 'cpp',
        'code': '#include <iostream>\nint main() { std::cout << "Hello Microservice"; return 0; }',
        'input': '',
        'expected': 'Hello Microservice',
        'time_limit': 1000,
        'memory_limit': 128
    }
    
    logger.info(f"Worker {worker_id} received task {task['id']}")
    
    try:
        # 1. 獲取 Judge
        judge = get_judge(task['language'])
        
        # 2. 執行評測
        result = judge.execute(
            code=task['code'],
            input_data=task['input'],
            expected_output=task['expected'],
            time_limit=task['time_limit'],
            memory_limit=task['memory_limit']
        )
        
        logger.info(f"Worker {worker_id} finished task {task['id']}: {result['status']}")
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        logger.error(f"Worker {worker_id} failed: {e}")

if __name__ == "__main__":
    # 確保依賴可用
    try:
        import docker
        logger.info("Docker SDK found.")
    except ImportError:
        logger.error("Please install docker: pip install docker")
        sys.exit(1)
        
    # 這裡我們需要 hack 一下，因為 apps.judge 依賴 django.conf.settings
    # 在純微服務化重構中，我們會移除這個依賴
    import django
    from django.conf import settings
    
    if not settings.configured:
        # 最小化 Django 配置
        settings.configure(
            DOCKER_IMAGE_JUDGE='oj-judge:latest',
            DOCKER_JUDGE_PIDS_LIMIT=64,
            DOCKER_JUDGE_TMPFS_SIZE='100M',
            DOCKER_JUDGE_TIMEOUT=60,
            DOCKER_SECCOMP_PROFILE=None,
            BASE_DIR='/tmp'
        )
    
    # 啟動演示
    logger.info("Starting Standalone Judge Worker Demo...")
    run_worker(1)
