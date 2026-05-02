export function filterByLevel(lines: string[], level: string): string[] {
    return lines.filter(line => 
        line.includes(`[${level}]`) || line.includes(level.toLowerCase())
    );
}

export function filterByKeyword(lines: string[], keyword: string): string[] {
    const lowerKeyword = keyword.toLowerCase();
    return lines.filter(line => 
        line.toLowerCase().includes(lowerKeyword)
    );
}

export interface LogMatch {
    matchLine: number;
    before: string[];
    match: string;
    after: string[];
}

export function searchWithContext(lines: string[], pattern: RegExp | string, contextLines: number): LogMatch[] {
    let regex: RegExp;
    if (pattern instanceof RegExp) {
        regex = new RegExp(pattern.source, pattern.flags);
    } else {
        try {
            regex = new RegExp(pattern, 'gi');
        } catch {
            regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        }
    }

    const matches: LogMatch[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (regex.test(line)) {
            const contextStart = Math.max(0, i - contextLines);
            const contextEnd = Math.min(lines.length - 1, i + contextLines);
            
            const before = lines.slice(contextStart, i);
            const after = lines.slice(i + 1, contextEnd + 1);
            
            matches.push({
                matchLine: i + 1,
                before,
                match: line,
                after
            });
            
            regex.lastIndex = 0;
        }
    }
    
    return matches;
}
