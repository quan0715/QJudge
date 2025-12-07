// Default code templates for each language
export const DEFAULT_TEMPLATES: Record<string, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    
    return 0;
}`
};

export const LANGUAGE_OPTIONS = [
  { id: 'cpp', label: 'C++', icon: 'cpp' }
];
