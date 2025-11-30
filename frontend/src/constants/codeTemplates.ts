// Default code templates for각 language
export const DEFAULT_TEMPLATES: Record<string, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    
    return 0;
}`,
  
  python: `# Write your code here
`,
  
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        
        // Write your code here
        
        scanner.close();
    }
}`,
  
  javascript: `// Write your code here
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (line) => {
    // Process input
});`
};

export const LANGUAGE_OPTIONS = [
  { id: 'cpp', label: 'C++', icon: 'cpp' },
  { id: 'python', label: 'Python', icon: 'python' },
  { id: 'java', label: 'Java', icon: 'java' },
  { id: 'javascript', label: 'JavaScript', icon: 'javascript' }
];
