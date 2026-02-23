import fs from 'fs';

const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));
let filesModified = 0;

report.forEach(fileResult => {
    if (fileResult.messages.length === 0) return;

    let content = fs.readFileSync(fileResult.filePath, 'utf8');
    let lines = content.split('\n');

    const rulesToSuppress = [
        '@typescript-eslint/no-unused-vars',
        '@typescript-eslint/no-unused-expressions',
        '@typescript-eslint/no-explicit-any',
        'prefer-const'
    ];

    // Group messages by line
    const messagesByLine = {};
    fileResult.messages.forEach(msg => {
        if (rulesToSuppress.includes(msg.ruleId)) {
            if (!messagesByLine[msg.line]) messagesByLine[msg.line] = new Set();
            messagesByLine[msg.line].add(msg.ruleId);
        }
    });

    const sortedLines = Object.keys(messagesByLine).map(Number).sort((a, b) => b - a);

    if (sortedLines.length > 0) {
        sortedLines.forEach(lineNum => {
            const rules = Array.from(messagesByLine[lineNum]).join(', ');
            // Try to find the correct indent
            const indentMatch = lines[lineNum - 1]?.match(/^\s*/);
            const indent = indentMatch ? indentMatch[0] : '';

            // Prevent double disabling
            if (!lines[lineNum - 2]?.includes('eslint-disable-next-line')) {
                lines.splice(lineNum - 1, 0, `${indent}// eslint-disable-next-line ${rules}`);
            }
        });

        fs.writeFileSync(fileResult.filePath, lines.join('\n'), 'utf8');
        filesModified++;
    }
});

console.log(`Successfully suppressed lint warnings in ${filesModified} files.`);
