import { expect, test } from "@playwright/test";
import path from "node:path";

const artifacts = [
  {artifact_id:"csv",filename:"report.csv",content_type:"text/csv"},
  {artifact_id:"md",filename:"review.md",content_type:"text/markdown"},
].map(a=>({...a,session_id:"session-1",produced_by_run_id:null,step:"default",size_bytes:128,checksum:"",metadata:{},created_at:"",updated_at:""}));
test.beforeEach(async ({page}) => {
  await page.route("**/api/v1/ai/artifacts/**", route => route.fulfill({json:{results:artifacts}}));
});
for (const theme of ["g100", "white"]) for (const width of [320,400,700,1440]) {
  test(`${theme} chat ${width}px`, async ({page}, info) => {
    const errors: string[]=[];
    page.on("pageerror", error=>errors.push(error.message));
    await page.setViewportSize({width:1440,height:900});
    await page.goto(`/tests/browser/fixtures/chat-composer.html?theme=${theme}${width<1440?`&side&width=${width}`:""}`);
    const capture = async (name: string) => {
      const screenshot = process.env.CHAT_SCREENSHOTS
        ? path.join(process.env.CHAT_SCREENSHOTS, `${theme}-${width}-${name}.png`)
        : info.outputPath(`chat-${name}.png`);
      await page.getByTestId("chat-frame").screenshot({path:screenshot});
      await info.attach(name,{path:screenshot,contentType:"image/png"});
    };
    const input=page.getByRole("textbox",{name:/訊息輸入/});
    await expect(input).toBeEnabled();
    const toolbar=page.getByRole("group",{name:"訊息操作"});
    const frame=(await page.getByTestId("chat-frame").boundingBox())!;
    const box=(await toolbar.locator("..").locator("..").boundingBox())!;
    if(width<1440){
      expect(box.x).toBeCloseTo(frame.x,0);
      expect(box.width).toBeCloseTo(frame.width,0);
      expect(box.y+box.height).toBeCloseTo(frame.y+frame.height,0);
      expect((await page.getByTestId("chat-divider").boundingBox())!.x).toBeCloseTo(box.x,0);
    }else{
      expect(box.width).toBe(900); expect(box.x).toBe(270);
      expect(frame.y+frame.height-box.y-box.height).toBe(24);
    }
    expect((await toolbar.boundingBox())!.height).toBe(48);
    const model=toolbar.getByRole("combobox");
    await model.click();
    const menu=page.getByRole("listbox");
    await expect(menu).toBeVisible();
    const menuBox=(await menu.boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(frame.x);
    expect(menuBox.x+menuBox.width).toBeLessThanOrEqual(frame.x+frame.width+1);
    await capture("models");
    await page.getByRole("option",{name:"DeepSeek V4.1 Flash"}).click();
    const todo=page.getByRole("button",{name:/任務.*1\/3/});
    const files=page.getByRole("button",{name:/檔案列表.*2/});
    expect((await todo.boundingBox())!.width).toBeLessThan(200);
    expect((await files.boundingBox())!.width).toBeLessThan(200);
    await todo.click();
    await expect(page.getByRole("region",{name:/任務/})).toContainText("核對答案");
    await capture("todos");
    await page.keyboard.press("Escape");
    await expect(todo).toBeFocused();
    const inputBorder = await input.evaluate(e=>getComputedStyle(e).borderBlockEndColor);
    const sectionBorder = await todo.locator("..").locator("..").evaluate(e=>getComputedStyle(e).borderBottomColor);
    expect(sectionBorder).toBe(inputBorder);
    expect(await files.evaluate(e=>getComputedStyle(e).borderInlineStartColor)).toBe(inputBorder);
    await files.click();
    const region=page.getByRole("region",{name:"檔案列表"});
    await expect(region).toBeVisible(); await expect(region).not.toContainText("128 B");
    const icons=await region.locator("button svg").evaluateAll(nodes=>nodes.map(n=>n.innerHTML));
    expect(icons).toHaveLength(2); expect(icons[0]).not.toEqual(icons[1]);
    const regionBox=(await region.boundingBox())!;
    expect(regionBox.x).toBeGreaterThanOrEqual(frame.x);
    expect(regionBox.x+regionBox.width).toBeLessThanOrEqual(frame.x+frame.width+1);
    await capture("files");
    await input.click(); await expect(region).not.toBeVisible();
    for(const [index,text] of ["第一句","第二句"].entries()){
      await input.fill(text); await input.press("Enter");
      await expect(page.locator("html")).toHaveAttribute("data-send-count",String(index+1));
      await expect(input).toHaveValue("");
      await expect(toolbar.getByRole("button",{name:/停止/})).not.toBeVisible();
    }
    await expect(page.getByText("等待下一步回應")).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
