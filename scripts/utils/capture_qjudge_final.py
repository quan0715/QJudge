import time
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 設定為 1280x800 正常比例
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("正在前往登入頁面...")
        page.goto("https://q-judge.com/login")
        
        print("執行登入...")
        page.fill("#email", "QAdmin")
        page.fill("#password", "Quan@0715")
        page.click("button[type='submit']")
        
        page.wait_for_url("**/dashboard*", timeout=60000)
        print("登入成功，導航至管理頁面...")

        target_url = "https://q-judge.com/classrooms/924abae8-bf3a-4479-8e38-bfbdfe9ea0fa/contest/08545ef3-9b1b-40ac-9afc-a751c36d2c4a/admin?grading_student=233&grading_students_only=1&grading_question=16d62b26-dc46-4ebc-94e2-908dc964b6cf&grading_view=matrix&panel=statistics"
        page.goto(target_url)
        page.wait_for_load_state("networkidle")
        time.sleep(5) 

        print("正在精確定位『結果摘要』旁的 X 按鈕...")
        try:
            # 使用 XPath 尋找文字為『結果摘要』的元素，並找到它左側的按鈕
            # //button[./following-sibling::*[contains(text(), '結果摘要')]] 
            # 或者找父容器裡面的第一個按鈕
            
            # 策略：尋找包含『結果摘要』的容器內的所有按鈕
            header_container = page.locator("div:has-text('結果摘要')").last
            # 尋找該容器內的按鈕 (通常 X 會是在文字之前的第一個按鈕)
            close_btn = header_container.locator("button").first
            
            if close_btn.is_visible():
                print("成功定位到 X 按鈕，執行點擊...")
                close_btn.click()
                time.sleep(2)
            else:
                # 備用方案：直接尋找與『結果摘要』同層級的按鈕
                close_btn = page.locator("//*[text()='結果摘要']/preceding-sibling::button").first
                if close_btn.is_visible():
                    close_btn.click()
                    print("使用備用方案點擊成功。")
                else:
                    print("無法定位按鈕，捕捉當前 HTML 結構以供診斷。")
                    print(header_container.inner_html())
        except Exception as e:
            print(f"操作時發生錯誤: {e}")

        # 最終截圖
        screenshot_path = "q_judge_admin_final.png"
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"截圖已儲存至 {screenshot_path}")
        
        browser.close()

if __name__ == "__main__":
    main()
