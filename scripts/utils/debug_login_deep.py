import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("1. 前往登入頁面...")
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        print("2. 填寫登入資訊...")
        # 使用更保險的定位方式
        page.locator("#email").fill("QAdmin")
        page.locator("#password").fill("Quan@0715")
        
        print("3. 點擊登入按鈕...")
        page.click("button[type='submit']")
        
        # 追蹤後續 10 秒的變化
        for i in range(1, 6):
            time.sleep(2)
            print(f"   [等待 {i*2}s] 目前 URL: {page.url}")
            page.screenshot(path=f"debug_login_step_{i}.png")
            
            # 檢查是否有錯誤訊息
            error_msg = page.query_selector(".cds--inline-notification--error, .error-message")
            if error_msg:
                print(f"   發現錯誤訊息: {error_msg.inner_text()}")

        # 檢查是否登入成功的標誌 (例如是否有 'dashboard' 字樣或特定的登出按鈕)
        is_logged_in = "dashboard" in page.url or page.query_selector("button:has-text('登出'), .user-avatar")
        print(f"最終登入判斷: {'成功' if is_logged_in else '失敗'}")

        browser.close()

if __name__ == "__main__":
    main()
