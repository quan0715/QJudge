import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 偽裝成正常的 Chrome 瀏覽器
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # 捕捉 API 回應，特別是失敗的請求並印出它的回應內容 (JSON/Text)
        def handle_response(response):
            if response.status >= 400:
                try:
                    body = response.text()
                    print(f"Network Error [{response.status}] {response.url}: {body}")
                except Exception as e:
                    print(f"Network Error [{response.status}] {response.url}: (無法解析回應內容: {e})")

        page.on("response", handle_response)
        page.on("console", lambda msg: print(f"Browser Console ({msg.type}): {msg.text}"))

        print("1. 前往登入頁面...")
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        print("2. 模擬真人輸入登入資訊...")
        # 點擊輸入框並逐字輸入
        page.locator("#email").click()
        page.locator("#email").type("QAdmin", delay=100)
        
        page.locator("#password").click()
        page.locator("#password").type("Quan@0715", delay=100)
        
        print("3. 強制點擊登入按鈕...")
        # 有些按鈕可能被遮擋，使用 force=True 或 evaluate 直接點擊
        submit_btn = page.locator("button[type='submit']")
        if submit_btn.is_visible():
            submit_btn.click(force=True)
        else:
            print("警告：找不到 submit 按鈕，嘗試點擊包含『登入』文字的按鈕")
            page.get_by_role("button", name="登入").first.click(force=True)

        # 等待網路請求
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        
        print(f"4. 點擊後 URL: {page.url}")
        
        # 如果登入成功，導航到目標頁面
        if "dashboard" in page.url or page.url != "https://q-judge.com/login":
            print("登入成功！導航至目標頁面...")
            target_url = "https://q-judge.com/classrooms/3d494646-3782-4201-a907-f3c078bdffb4/contest/877cc2ca-7b6e-4e64-91df-134119f5267b"
            page.goto(target_url)
            page.wait_for_load_state("networkidle")
            time.sleep(5)
            
            screenshot_path = "q_judge_success_contest.png"
            page.screenshot(path=screenshot_path)
            print(f"✅ 截圖已儲存至 {screenshot_path}")
        else:
            print("❌ 登入仍然失敗。捕捉當前畫面...")
            page.screenshot(path="debug_login_failed_again.png")

        browser.close()

if __name__ == "__main__":
    main()
