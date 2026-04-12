import time
from playwright.sync_api import sync_playwright
from PIL import Image

def main():
    with sync_playwright() as p:
        # 使用有介面的瀏覽器以便觀察，或者 headless=True 進行後台作業
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        print("正在前往登入頁面...")
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        # 截一張圖除錯登入頁面
        page.screenshot(path="debug_login_page.png")
        print("已截取登入頁面進行除錯。")

        print("執行登入...")
        # 嘗試常見的選擇器或直接用 placeholder
        try:
            # 根據常見框架，可能是 email 或 username
            # 我們嘗試使用 placeholder 或多種可能
            user_input = page.locator("input[placeholder*='帳號'], input[placeholder*='Email'], input[name='username'], input[name='email'], input#email").first
            pass_input = page.locator("input[placeholder*='密碼'], input[name='password'], input#password").first
            
            user_input.fill("QAdmin")
            pass_input.fill("Quan@0715")
            page.get_by_role("button", name="登入").first.click()
        except Exception as e:
            print(f"嘗試登入失敗: {e}")
            # 如果失敗，印出所有 input 的屬性
            inputs = page.query_selector_all("input")
            for i, input in enumerate(inputs):
                print(f"Input {i}: name={input.get_attribute('name')}, id={input.get_attribute('id')}, placeholder={input.get_attribute('placeholder')}")
            raise e
        
        # 等待導航完成
        page.wait_for_load_state("networkidle")
        print("登入成功，導航至目標管理頁面...")

        target_url = "https://q-judge.com/classrooms/924abae8-bf3a-4479-8e38-bfbdfe9ea0fa/contest/08545ef3-9b1b-40ac-9afc-a751c36d2c4a/admin?grading_student=233&grading_students_only=1&grading_question=16d62b26-dc46-4ebc-94e2-908dc964b6cf&grading_view=matrix&panel=statistics"
        page.goto(target_url)
        page.wait_for_load_state("networkidle")
        time.sleep(3) # 等待面板與資料載入完全

        print("正在處理工具列按鈕...")
        # 根據描述，點擊掉「統計資料」面板
        # 通常這類面板在 URL 參數中有 panel=statistics，點擊對應的按鈕（例如 "統計資料" 或其關閉圖示）會將其關閉
        # 我們尋找包含 "統計" 或 "Statistics" 且正在啟動狀態的按鈕或關閉鈕
        try:
            # 嘗試尋找並點擊該面板的開關按鈕
            # 這裡我們先嘗試尋找包含 "統計" 字樣的按鈕
            statistics_btn = page.get_by_role("button", name="統計資料")
            if statistics_btn.is_visible():
                statistics_btn.click()
                print("已點擊統計資料按鈕以關閉面板。")
            else:
                # 如果是點擊「結果摘要」旁的按鈕
                summary_btn = page.get_by_role("button", name="結果摘要")
                if summary_btn.is_visible():
                     # 這裡可能需要更精確的邏輯，先截一張圖確認目前狀態
                     pass
        except Exception as e:
            print(f"點擊按鈕時發生錯誤: {e}")

        time.sleep(2) # 等待動畫結束
        
        screenshot_path = "q_judge_admin_panel.png"
        page.screenshot(path=screenshot_path, full_page=False)
        print(f"截圖已儲存至 {screenshot_path}")
        
        browser.close()

if __name__ == "__main__":
    main()
