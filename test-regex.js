const code = `sequenceDiagram
    autonumber
    participant User as User
    participant ReactAnim as ChemReactAnimActor
    participant Break as AnimBondBreak
    participant Rebuild as AnimBondRebuild
    participant Rotate as AnimMolRotate
    participant Migrate as AnimMolMigrate

    User->>ReactAnim: PlayStep()
    ReactAnim->>ReactAnim: DestroyAnimActors()
    ReactAnim->>ReactAnim: Spawn Anim Actors

    ReactAnim->>Rotate: Play(FMolRotateAction)
    Rotate-->>ReactAnim: OnAnimationComplete

    ReactAnim->>Break: Play(FBondBreakAction)
    Break-->>ReactAnim: OnAnimationComplete

    ReactAnim->>Migrate: Play(FMolMigrateAction)
    Migrate-->>ReactAnim: OnAnimationComplete

    ReactAnim->>Rebuild: Play(FBondRebuildAction)
    Rebuild-->>ReactAnim: OnAnimationComplete
    ReactAnim-->>User: OnAnimComplete`;

function preprocessMermaid(code) {
    let result = code;
    
    // 检测是否为时序图
    const isSequenceDiagram = /^\s*sequenceDiagram\s*$/m.test(result);
    console.log('Is Sequence Diagram:', isSequenceDiagram);
    
    // 处理时序图消息中的特殊字符
    if (isSequenceDiagram) {
        result = result.replace(
            /^(\s*)(\w+)(--?>>?|--?[x)]|--?>)(\w+):\s*(.+)$/gm,
            (match, indent, from, arrow, to, message) => {
                console.log(`Processing: ${from}${arrow}${to}: ${message}`);
                if (message.startsWith('"') && message.endsWith('"')) {
                    return match;
                }
                // 使用 HTML 实体编码替换括号
                const hasParentheses = /[()]/.test(message);
                if (hasParentheses) {
                    const encodedMessage = message
                        .replace(/\(/g, '#40;')
                        .replace(/\)/g, '#41;');
                    console.log(`  -> Encoded: ${encodedMessage}`);
                    return `${indent}${from}${arrow}${to}: ${encodedMessage}`;
                }
                return match;
            }
        );
    }
    
    return result;
}

const result = preprocessMermaid(code);
console.log('\n=== RESULT ===');
console.log(result);
