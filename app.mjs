import { configDotenv } from "dotenv";
import { v4 as uuidv4 } from "uuid";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
configDotenv();

function sanitizeFilename(filename) {
  return filename.replace(/[:*?"<>|/\\]/g, "_").substring(0, 155);
}
const PARAMS = "offset";
const NUM_INC = 20;
const MAX = 79;
(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    executablePath: process.env.EXECUTABLE_PATH,
  });

  const page = await browser.newPage();

  // Set screen size
  await page.setViewport({ width: 1080, height: 1024 });
  for (let i = 0; i < MAX; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.goto(
      process.env.URL_PAGE +
        `handle/HUST/23` +
        `?${PARAMS}=${(i + 1) * NUM_INC}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 0,
      }
    );
    const list = await page.$$eval("tr.ikr-browse-item", (rows) => {
      return rows.map((row) => {
        const rowText = row.innerText;
        const links = Array.from(row.querySelectorAll("a")).map((link) => {
          return {
            href: link.href,
            text: link.innerText,
          };
        });

        return {
          rowText,
          links,
        };
      });
    });

    for (const item of list) {
      const descriptions = item.rowText
        .split("\n")
        .filter((r) => r !== new RegExp("\n"));
      const dir = `./newCrawl/${sanitizeFilename(descriptions[2])}${uuidv4()}`;
      fs.mkdirSync(dir);
      console.log(item.links);

      await page.goto(item.links[1].href, {
        timeout: 0,
        waitUntil: "domcontentloaded",
      });
      //   // Wait for the elements to be available
      // await page.waitForSelector("a.viewonline");

      //   // Get the URLs
      const urls = await page.$$eval("a.viewonline", (links) =>
        links.map((link) => link.href)
      );
      if (urls.length === 0) {
        console.log("No online content found");
        fs.rmdirSync(dir);
        await page.close();
        continue;
      }
      //   // Modify URLs by changing type=6 to type=7
      const modifiedUrls = urls.map((url) => url.replace("type=6", "type=7"));

      //   // Log modified URLs
      console.log("Modified URLs:", modifiedUrls);

      // Function to delay execution
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // Load each modified URL and save the content
      for (const url of modifiedUrls) {
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 0,
          });
          // await delay(3000);

          // Save the content of the page
          const frameUrl = await page.evaluate(() => {
            const frame = document.querySelector("frame");
            return frame ? frame.src : null;
          });

          if (!frameUrl) {
            throw new Error("No frame URL found.");
          }

          // Create URL full form src of tag <frame>
          const fullFrameUrl = new URL(frameUrl, page.url()).href;

          // Dow content form URL of tag <frame>
          const newPage = await browser.newPage();
          await newPage.goto(fullFrameUrl, {
            waitUntil: "domcontentloaded",
            timeout: 0,
          });

          // Save frame
          const content = await newPage.content();
          const htmlFilePath = path.resolve(
            __dirname,
            dir + `/${uuidv4()}frame-content.html`
          );
          fs.writeFileSync(htmlFilePath, content, "utf-8");
          console.log(`Saved frame content to ${dir + htmlFilePath}`);

          const screenshotPath = path.resolve(
            __dirname,
            dir + `/${uuidv4()}frame-screenshot.png`
          );
          await newPage.screenshot({
            path: screenshotPath,
            fullPage: true,
          });
          console.log(`Saved screenshot to ${dir + screenshotPath}`);
          await newPage.close();
        } catch (error) {
          console.error(`Failed to load ${url}:`, error);
        }
      }
    }
  }

  await browser.close();
})();
