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
        page.on("console", lambda msg: print(f"Console: {msg.text}"))

        print("1. 前往登入頁面...")
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        print("2. 執行登入...")
        page.locator("#email").click()
        page.locator("#email").type("QAdmin", delay=50)
        page.locator("#password").click()
        page.locator("#password").type("Quan@0715", delay=50)
        page.click("button[type='submit']")
        
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        
        if "login" in page.url:
            print("登入可能失敗，捕捉錯誤...")
            page.screenshot(path="debug_login_error.png")
            return

        print("登入成功！")
        
        target_url = "https://q-judge.com/classrooms/3d494646-3782-4201-a907-f3c078bdffb4/contest/877cc2ca-7b6e-4e64-91df-134119f5267b"
        print(f"3. 導航至考試頁面: {target_url}")
        page.goto(target_url)
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        
        page.screenshot(path="q_judge_exam_page_step1.png")
        
        print("4. 尋找並點擊『重新開始』...")
        try:
            restart_btn = page.get_by_role("button", name="重新開始")
            if restart_btn.is_visible():
                restart_btn.click()
                time.sleep(2)
                print("已點擊『重新開始』。")
            else:
                print("找不到『重新開始』按鈕。")
        except Exception as e:
            print(f"點擊『重新開始』失敗: {e}")

        page.screenshot(path="q_judge_exam_page_step2.png")

        print("5. 尋找最左上角的『上一頁』按鈕...")
        try:
            # 可能是一個返回的 icon 或帶有 aria-label="back" 或 "上一頁" 的按鈕
            back_btn = page.locator("button[aria-label*='back'], button[title*='上'], button:has(svg)").first
            # 這裡試著抓畫面最左上角的按鈕
            if back_btn.is_visible():
                back_btn.click()
                time.sleep(2)
                print("已點擊『上一頁』。")
            else:
                print("找不到『上一頁』按鈕。")
        except Exception as e:
            print(f"點擊『上一頁』失敗: {e}")
            
        page.screenshot(path="q_judge_exam_page_step3.png")

        print("6. 尋找並點擊『結束考試』...")
        try:
            end_btn = page.get_by_role("button", name="結束考試")
            if end_btn.is_visible():
                end_btn.click()
                time.sleep(2)
                print("已點擊『結束考試』。")
                
                # 可能會有確認對話框，我們也嘗試點擊確認
                confirm_btn = page.get_by_role("button", name="確認").first
                if confirm_btn.is_visible():
                    confirm_btn.click()
                    print("已點擊確認結束。")
                    time.sleep(2)
            else:
                print("找不到『結束考試』按鈕。")
        except Exception as e:
            print(f"點擊『結束考試』失敗: {e}")
            
        print("7. 拍攝最終截圖...")
        page.screenshot(path="q_judge_exam_final.png")
        print("流程完成，截圖已儲存為 q_judge_exam_final.png")
        
        browser.close()

if __name__ == "__main__":
    main()
