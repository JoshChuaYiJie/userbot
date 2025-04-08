const puppeteer = require ("puppeteer");

async function loadPage() {


    var browser = await puppeteer.launch();
    var page = await browser.newPage();

    await page.goto('https://news.ycombinator.com');

    var Pagetitle = await page.title();
    var Pagecontents = await page.content();
    console.log(Pagetitle);
    console.log('Pagecontents', Pagecontents);

    await page.screenshot({path: "hackernews.png"})

    await browser.close();
}

loadPage();