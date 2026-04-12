import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("正在前往登入頁面...")
        page.goto("https://q-judge.com/login")
        
        print("執行登入...")
        page.fill("#email", "QAdmin")
        page.fill("#password", "Quan@0715")
        page.click("button[type='submit']")
        
        # 這裡不再等待特定 URL，而是給予一些緩衝時間或等候網路閒置
        # 直接等待一段時間後嘗試導航
        time.sleep(5)
        print("登入操作完成，嘗試導航至目標競賽頁面...")

        target_url = "https://q-judge.com/classrooms/3d494646-3782-4201-a907-f3c078bdffb4/contest/877cc2ca-7b6e-4e64-91df-134119f5267b"
        page.goto(target_url)
        
        # 等待頁面與相關資料載入
        page.wait_for_load_state("networkidle")
        time.sleep(5) 

        # 拍攝截圖
        screenshot_path = "q_judge_new_contest.png"
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"截圖已儲存至 {screenshot_path}")
        
        browser.close()

if __name__ == "__main__":
    main()
