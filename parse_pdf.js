const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const buffer = fs.readFileSync('C:/Users/Sanji/.gemini/antigravity/brain/f0dc63a2-714d-46e5-b5f7-f4d9aed20a86/KPI Tracking - DIGITAL MARKETING EXECUTIVE.pdf');

const parser = new PDFParse({ data: buffer });

parser.getText().then(textResult => {
    fs.writeFileSync('C:/Users/Sanji/.gemini/antigravity/brain/f0dc63a2-714d-46e5-b5f7-f4d9aed20a86/pdf_content.txt', textResult.text, 'utf8');
    console.log("PDF parsed successfully, output written to pdf_content.txt");
    parser.destroy();
}).catch(err => {
    console.error("Error parsing pdf:", err);
});
