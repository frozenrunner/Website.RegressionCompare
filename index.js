const { chromium, webkit, firefox } = require('playwright');
const fs = require('fs');
const looksSame = require("looks-same");
const pageList = require("./pageList.json");

//Check if images are the same
const looksSamePromise = (oldImagePath, newImagePath) => new Promise((resolve, reject) => {
    looksSame(oldImagePath, newImagePath, {strict: false}, function(error, {equal}) {
        if (error === null || error === undefined) {
            resolve(equal);
        }
        else {
            reject(error);
        }
    })
});

//Create diff image
const looksSameDiffPromise = (pathBase) => new Promise((resolve, reject) => {
    looksSame.createDiff({
        reference: `${pathBase}-prod.png`,
        current: `${pathBase}-dev.png`,
        diff: `${pathBase}-diff.png`,
        highlightColor: '#ff00ff', // color to highlight the differences
        strict: false, // strict comparsion
        antialiasingTolerance: 0,
        ignoreAntialiasing: true, // ignore antialising by default
        ignoreCaret: true // ignore caret by default
    }, function(error) {
        if (error === null || error === undefined) {
            resolve(true);
        }
        else {
            reject(false);
        }
    })
});

//Check all 3 major rending engines (technically 2 but Safari is safari, so webkit too)
(async () => {
    const date = new Date();
    const folderName = `testOutput/${date.getFullYear()}.${date.getMonth()}.${date.getDate()}.${date.getUTCHours()}.${date.getMinutes()}.${date.getSeconds()}`;
    await Promise.all([
         TestReport(chromium, folderName)
        //TestReport(webkit, folderName, "en")
      //TestReport(firefox, folderName, "en")
    ]);
    process.exit();
})();


async function TestReport (browser, folderName) {
    const browserName = browser._initializer.name;
    folderName += `/${browserName}`;

    let reportResultHtml = ``;
    

    for (let [id, requestId] of Object.entries(pageList.PageIds)) {
        let sectionHtml = ``;
        const oldBrowser = await browser.launch({headless: true});
        const oldContext = await oldBrowser.newContext({ ignoreHTTPSErrors: true });
        oldContext.setDefaultTimeout(60000);
        const oldPage = await oldContext.newPage();
    
        const newBrowser = await browser.launch({headless: false});
        const newContext = await newBrowser.newContext({ ignoreHTTPSErrors: true });
        newContext.setDefaultTimeout(60000);
        const newPage = await newContext.newPage();

        for (let [selector, selectorString] of Object.entries(pageList.SectionSelectors)) {
            
            await Promise.all([
                oldPage.goto(`${pageList.Urls.Old}?id=${id}`),
                newPage.goto(`${pageList.Urls.New}?id=${id}`)
            ]);
            console.log(`${browserName} - ${id} - ${selector} - Desktop`);
//Desktop

            await oldPage.setViewportSize({ width: 1024, height: 1000 });
            await newPage.setViewportSize({ width: 1024, height: 1000 });

            await oldPage.waitForSelector(selectorString);
            await newPage.waitForSelector(selectorString);

            const desktopImageName = `${id}-${selector}-Desktop`;
            const desktopPathBase = `${folderName}/${desktopImageName}`;

            sectionHtml += await ValidateSection (oldPage, newPage, selectorString, desktopPathBase, desktopImageName, selector, "Desktop", "");

//Tablet

            await oldPage.setViewportSize({ width: 768, height: 1000 });
            await newPage.setViewportSize({ width: 768, height: 1000 });
            await newPage.waitForSelector(selectorString);

            const tabletImageName = `${id}-${selector}-Tablet`;
            const tabletPathBase = `${folderName}/${tabletImageName}`;

            console.log(`${browserName} - ${id} - ${selector} - Tablet`);
            sectionHtml += await ValidateSection (oldPage, newPage, selectorString, tabletPathBase, tabletImageName, selector, "Tablet", "");

            console.log(`${browserName}- ${id} - ${selector} - Tablet`);

//Mobile
      
      
            await oldPage.setViewportSize({ width: 375, height: 1000 });
            await newPage.setViewportSize({ width: 375, height: 1000 });

            await newPage.waitForSelector(selectorString);
            
            const mobileImageName = `${id}-${selector}-Mobile`;
            const mobilePathBase = `${folderName}/${mobileImageName}`;
            
            console.log(`${browserName} - ${id} - ${selector} - Mobile`);
            sectionHtml += await ValidateSection (oldPage, newPage, selectorString, mobilePathBase, mobileImageName, selector, "Mobile", "");

        }
        reportResultHtml += CreateTestResultSection(id, requestId, sectionHtml);
        await oldBrowser.close();
        await newBrowser.close();
    }

    const htmlTemplateString = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Regression Test</title>
        <link href="../../../visual-regression.css" rel="stylesheet">
    </head>
    <body>
        <h1>${browserName}</h1>
        ${reportResultHtml}
    </body>
    </html>`

    fs.writeFileSync(`${folderName}/output.html`, htmlTemplateString)
}

async function ValidateSection(oldPage, newPage, selectorString, pathBase, imageName, selector, size, titleExtra) {
    //single retry on fail
    await oldPage.waitForSelector(`${selectorString}`).catch(error => {
        oldPage.waitForSelector(`${selectorString}`)
    });
    await newPage.waitForSelector(`${selectorString}`).catch(error => {
        newPage.waitForSelector(`${selectorString}`)
    });

    const oldSection = await oldPage.$(`${selectorString}`);
    const newSection = await newPage.$(`${selectorString}`);

    const oldImagePath = `${pathBase}-prod.png`;
    const newImagePath = `${pathBase}-dev.png`;

    await Promise.all([
        await oldSection.screenshot({ path: oldImagePath, fullPage: true}),
        await newSection.screenshot({ path: newImagePath, fullPage: true})
    ]);

    const sectionsAreTheSame = await looksSamePromise(oldImagePath, newImagePath).catch(() => {
        return false;
    });

    await looksSameDiffPromise(pathBase);

    const title = `${selector} ${size}${titleExtra !== "" ? " - " + titleExtra : ""}`;
    return CreateSectionHtml(imageName, title, sectionsAreTheSame)
}

function CreateTestResultSection(id, requestId, sectionHtml) {
    return `
    <div class="result-group">
        <div class="test-run-title">
            <h2>${id} - ${requestId}</h1>
            <h3 class="new">New</h2>
            <h3 class="old">Old</h2>
            <h3 class="diff">Diff</h2>
        </div>
        <div class="test-run-results">
            ${sectionHtml}
        </div>
    </div>`;
}

function CreateSectionHtml(imageName, title, sectionsAreTheSame) {
    let imageHtml = ``;
    
    if (sectionsAreTheSame === false) {
        imageHtml = `
        <img class="new" src="${imageName}-dev.png"/>
        <img class="old" src="${imageName}-prod.png"/>
        <img class="diff" src="${imageName}-diff.png"/>`;
    } else {
        imageHtml = `
        <h4 class="test-result-pass">Test passed, no diff detected</h4>`;
    }

    return `
    <div class="test-run-section">
        <h4>${title}</h4>
        ${imageHtml}
    </div>
    `;
}