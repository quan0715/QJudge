import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print("1. 前往登入頁面並登入...")
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        page.locator("#email").click()
        page.locator("#email").type("QAdmin", delay=50)
        page.locator("#password").click()
        page.locator("#password").type("Quan@0715", delay=50)
        page.click("button[type='submit']")
        
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        target_url = "https://q-judge.com/classrooms/3d494646-3782-4201-a907-f3c078bdffb4/contest/877cc2ca-7b6e-4e64-91df-134119f5267b"
        print(f"2. 導航至考試頁面: {target_url}")
        page.goto(target_url)
        page.wait_for_load_state("networkidle")
        time.sleep(5)
        
        print("3. 點擊『重新開始』按鈕...")
        try:
            start_btn = page.locator("button:has-text('重新開始'), button:has-text('開始')").first
            if start_btn.is_visible():
                start_btn.click()
                print("已點擊『重新開始』按鈕。")
                time.sleep(3) # 等待畫面切換
            else:
                print("警告：畫面上未找到『重新開始』或『開始』按鈕。")
        except Exception as e:
            print(f"點擊開始發生錯誤: {e}")

        print("4. 拍攝目標截圖...")
        screenshot_path = "q_judge_exam_started.png"
        page.screenshot(path=screenshot_path)
        print(f"✅ 截圖已儲存至 {screenshot_path}")

        print("5. 執行退出流程 (避免帳號被鎖)...")
        try:
            print("尋找最左上角的『上一頁』按鈕...")
            # 左上角的按鈕通常帶有 svg，且可能是頁面上的第一個 button 或帶有特定 class
            back_btn = page.locator("button[aria-label*='back'], button[title*='上'], button:has(svg), a.back-button, button.back-button").first
            if back_btn.is_visible():
                back_btn.click()
                time.sleep(2)
                print("已點擊『上一頁』。")
            else:
                print("未明確找到『上一頁』圖示，嘗試直接尋找『結束考試』。")

            print("尋找『結束考試』按鈕...")
            end_btn = page.locator("button:has-text('結束考試'), button:has-text('結束'), button:has-text('交卷')").first
            if end_btn.is_visible():
                end_btn.click()
                time.sleep(2)
                print("已點擊『結束考試』。")
                
                # 確認對話框
                confirm_btn = page.locator("button:has-text('確認'), button:has-text('確定')").first
                if confirm_btn.is_visible():
                    confirm_btn.click()
                    print("已點擊『確認結束』對話框。")
                    time.sleep(2)
            else:
                print("警告：未找到『結束考試』按鈕，帳號可能仍未解鎖，請檢查截圖狀態。")

        except Exception as e:
            print(f"退出流程發生錯誤: {e}")
            page.screenshot(path="debug_exit_error.png")

        print("自動化流程結束。")
        browser.close()

if __name__ == "__main__":
    main()
