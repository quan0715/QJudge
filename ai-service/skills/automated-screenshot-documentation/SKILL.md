---
name: Automated Screenshot Documentation
description: Using Playwright to capture UI screenshots, process images with Python Pillow (highlight buttons, add text labels), and embed them into operation manuals.
---

# Automated Screenshot Documentation Workflow

This skill provides a standardized workflow to capture application UI screenshots autonomously, edit them to emphasize UI elements (such as clicking a specific button), and insert them directly into project documentation.

## Prerequisites

1.  **Environment Needs**: Ensure the target application environment (e.g., `docker-compose.test.yml`) is properly running. 
2.  **Dependencies**: Install required Python libraries contextually: 
    ```bash
    pip install playwright pillow
    playwright install chromium
    ```

## Step-by-Step Execution

### 1. Identify Target and Data Constraints

Determine the target UI flow and any prerequisite user states. If seeding data is required (e.g., E2E test environments), run the associated backend seed command:

```bash
docker compose -f docker-compose.test.yml exec backend-test python manage.py seed_e2e_data
```

### 2. Create the Automation Script (`capture_screenshot.py`)

Create a Python script that leverages Playwright to navigate the application and Pillow (`Image`, `ImageDraw`) to annotate the returned screenshot. 

Example specifically for **Creating an Exam**:

```python
import time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Using a fixed viewport helps standardize image output sizes.
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        # Step A: Authentication
        page.goto("http://localhost:5174/login")
        page.fill("#email", "teacher@example.com")
        page.fill("#password", "teacher123")
        page.click("button[type='submit']")
        page.wait_for_url("**/dashboard*")
        
        # Step B: Page Navigation
        page.goto("http://localhost:5174/teacher/contests")
        page.wait_for_load_state("networkidle")
        
        # Step C: Element Selection and Bounding Box Extraction
        page.wait_for_selector("text=新增競賽", timeout=10000)
        time.sleep(1) # Extra stability for visual animations
        
        button = page.locator("text=新增競賽").first
        box = button.bounding_box()
        
        # Step D: Screenshot Capture
        raw_image_path = "raw_screenshot.png"
        page.screenshot(path=raw_image_path)
        browser.close()
        
        # Step E: Image Annotation
        img = Image.open(raw_image_path)
        draw = ImageDraw.Draw(img)
        
        if box:
            pad = 12
            x0, y0 = box["x"] - pad, box["y"] - pad
            x1, y1 = box["x"] + box["width"] + pad, box["y"] + box["height"] + pad
            
            # Draw highlight rectangle
            draw.rectangle([x0, y0, x1, y1], outline="red", width=4)
            # Add label text above the element
            text = "Click here to Create Exam"
            try:
                # Load a larger system font
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
            except IOError:
                try:
                    font = ImageFont.truetype("Arial.ttf", 28)
                except IOError:
                    font = ImageFont.load_default()
            
            # Use textbbox for precise positioning
            text_bbox = draw.textbbox((0, 0), text, font=font)
            text_height = text_bbox[3] - text_bbox[1]
            draw.text((x0, y0 - text_height - 15), text, fill="red", font=font)
        
        final_image_path = "create_exam_tutorial.png"
        img.save(final_image_path)
        print(f"Annotated UI screenshot saved to {final_image_path}")

if __name__ == "__main__":
    main()
```

### 3. Run the Automation Script

Execute the script from the root application context:
```bash
python3 capture_screenshot.py
```

### 4. Relocate the Output to Documentation Assets

Move the processed output `create_exam_tutorial.png` into the target application `docs/images` folder (e.g., `/frontend/public/docs/images/`).

```bash
mkdir -p frontend/public/docs/images
mv create_exam_tutorial.png frontend/public/docs/images/
```

### 5. Update the Operation Manual

Use a file editing tool (like `replace_file_content` or `multi_replace_file_content`) to append markdown linking the newly captured image asset into the appropriate tutorial step. 

Example updating `frontend/public/docs/zh-TW/teacher-overview.md` on creating an exam:

```markdown
1. 建立競賽（公開/私人）
   - 請前往「我的競賽管理」頁面，並點擊右上角的「新增競賽」按鈕來建立一場新的測驗：
   ![新增競賽範例圖](/docs/images/create_exam_tutorial.png)
```

## Review

Always confirm that:
- The UI rendered completely before the screenshot was taken (ensure there are sufficient `wait_for` directives).
- The bounding box actually coordinates closely overlapping the described text constraint. 
- The markdown path explicitly matches the target `images` relational directory.
