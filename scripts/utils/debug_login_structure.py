from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://q-judge.com/login")
        page.wait_for_load_state("networkidle")
        
        print(f"目前 URL: {page.url}")
        
        # 列出所有 input 標籤
        inputs = page.query_selector_all("input")
        print("發現的 Input 欄位:")
        for i in inputs:
            print(f"  - tag: {i.evaluate('el => el.tagName')}, type: {i.get_attribute('type')}, name: {i.get_attribute('name')}, id: {i.get_attribute('id')}, placeholder: {i.get_attribute('placeholder')}")
            
        # 列出所有 button
        buttons = page.query_selector_all("button")
        print("發現的 Button 欄位:")
        for b in buttons:
            print(f"  - text: {b.inner_text()}, type: {b.get_attribute('type')}, class: {b.get_attribute('class')}")
            
        browser.close()

if __name__ == "__main__":
    main()
