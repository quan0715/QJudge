#!/usr/bin/env python3
"""
i18n Translation Usage Analyzer for QJudge

This script analyzes translation key usage across the codebase to identify:
1. Which translation keys are used in multiple files (should be in common.json)
2. Which translation keys are never used (can be removed)
3. Usage statistics for each translation key
4. Recommendations for improving translation organization

Usage:
    python3 scripts/analyze-i18n-usage.py

Output:
    - Console report with analysis
    - Optional JSON report file with detailed data
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Set, Tuple

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class TranslationUsageAnalyzer:
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.locales_path = self.base_path / "frontend/src/i18n/locales"
        self.src_path = self.base_path / "frontend/src"
        
        # Store translation keys by namespace
        self.translation_keys: Dict[str, Set[str]] = defaultdict(set)
        
        # Store usage information: key -> list of (file, line_number)
        self.key_usage: Dict[str, List[Tuple[str, int]]] = defaultdict(list)
        
    def load_translation_keys(self):
        """Load all translation keys from zh-TW (source of truth)"""
        zh_tw_path = self.locales_path / "zh-TW"
        
        if not zh_tw_path.exists():
            print(f"{Colors.FAIL}Error: Translation directory not found: {zh_tw_path}{Colors.ENDC}")
            sys.exit(1)
        
        for json_file in zh_tw_path.glob("*.json"):
            namespace = json_file.stem  # e.g., "common", "contest", etc.
            
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    keys = self._extract_keys(data, namespace)
                    self.translation_keys[namespace].update(keys)
            except Exception as e:
                print(f"{Colors.FAIL}Error loading {json_file}: {e}{Colors.ENDC}")
    
    def _extract_keys(self, obj, namespace: str, prefix: str = "") -> Set[str]:
        """Recursively extract all translation keys with their full path"""
        keys = set()
        
        if isinstance(obj, dict):
            for key, value in obj.items():
                full_key = f"{prefix}.{key}" if prefix else key
                full_path = f"{namespace}.{full_key}"
                keys.add(full_path)
                
                if isinstance(value, dict):
                    keys.update(self._extract_keys(value, namespace, full_key))
        
        return keys
    
    def scan_source_files(self):
        """Scan all source files for translation key usage"""
        # Patterns to match translation usage
        patterns = [
            re.compile(r't\(["\']([^"\']+)["\']\)'),  # t("key")
            re.compile(r't\(`([^`]+)`\)'),             # t(`key`)
            re.compile(r'useTranslation\(["\']([^"\']+)["\']\)'),  # useTranslation("namespace")
        ]
        
        # Find all tsx, ts, jsx, js files
        for ext in ['*.tsx', '*.ts', '*.jsx', '*.js']:
            for file_path in self.src_path.rglob(ext):
                # Skip node_modules, dist, build directories
                if any(skip in str(file_path) for skip in ['node_modules', 'dist', 'build', '.test.', '.spec.']):
                    continue
                
                self._scan_file(file_path, patterns)
    
    def _scan_file(self, file_path: Path, patterns: List[re.Pattern]):
        """Scan a single file for translation key usage"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
                
                # Track which namespace is being used in this file
                current_namespace = None
                for i, line in enumerate(lines, 1):
                    # Check for useTranslation hook
                    namespace_match = re.search(r'useTranslation\(["\']([^"\']+)["\']\)', line)
                    if namespace_match:
                        current_namespace = namespace_match.group(1)
                    
                    # Check for t() function calls
                    for pattern in patterns:
                        matches = pattern.finditer(line)
                        for match in matches:
                            key = match.group(1)
                            
                            # Skip if it's a variable or template
                            if '$' in key or '{' in key:
                                continue
                            
                            # If key doesn't contain namespace, prepend current namespace
                            if '.' in key and not key.split('.')[0] in ['common', 'contest', 'problem', 'admin', 'docs']:
                                if current_namespace:
                                    full_key = f"{current_namespace}.{key}"
                                else:
                                    continue
                            else:
                                full_key = key
                            
                            # Store usage
                            rel_path = file_path.relative_to(self.src_path)
                            self.key_usage[full_key].append((str(rel_path), i))
        
        except Exception as e:
            pass  # Skip files that can't be read
    
    def analyze(self) -> Dict:
        """Perform analysis and return results"""
        results = {
            'multi_file_keys': defaultdict(list),  # Keys used in multiple files
            'single_file_keys': defaultdict(list),  # Keys used in only one file
            'unused_keys': defaultdict(list),       # Keys never used
            'cross_namespace_usage': defaultdict(int),  # Keys that might belong in common
        }
        
        # Analyze each translation key
        all_keys = set()
        for namespace, keys in self.translation_keys.items():
            all_keys.update(keys)
        
        for key in all_keys:
            usages = self.key_usage.get(key, [])
            num_files = len(set(file for file, _ in usages))
            
            namespace = key.split('.')[0]
            
            if num_files == 0:
                results['unused_keys'][namespace].append(key)
            elif num_files == 1:
                results['single_file_keys'][namespace].append((key, usages))
            else:
                results['multi_file_keys'][namespace].append((key, usages))
                
                # If a non-common key is used in multiple files, flag it
                if namespace != 'common' and num_files >= 2:
                    results['cross_namespace_usage'][key] = num_files
        
        return results
    
    def print_report(self, results: Dict):
        """Print analysis report"""
        print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*80}")
        print(f"i18n Translation Usage Analysis Report")
        print(f"{'='*80}{Colors.ENDC}\n")
        
        # Summary
        total_keys = sum(len(keys) for keys in self.translation_keys.values())
        total_used = sum(len(self.key_usage.get(key, [])) > 0 
                        for namespace_keys in self.translation_keys.values() 
                        for key in namespace_keys)
        
        print(f"{Colors.OKBLUE}{Colors.BOLD}📊 Summary{Colors.ENDC}")
        print(f"  Total translation keys: {total_keys}")
        print(f"  Used keys: {total_used} ({total_used*100//total_keys if total_keys else 0}%)")
        print(f"  Unused keys: {total_keys - total_used}")
        
        # Multi-file usage (candidates for common.json)
        print(f"\n{Colors.OKBLUE}{Colors.BOLD}🔄 Keys Used in Multiple Files{Colors.ENDC}")
        
        cross_namespace = sorted(results['cross_namespace_usage'].items(), 
                                key=lambda x: x[1], reverse=True)
        
        if cross_namespace:
            print(f"\n{Colors.WARNING}Non-common keys used in multiple files (Should move to common.json):{Colors.ENDC}")
            for key, num_files in cross_namespace:
                usages = self.key_usage[key]
                files = set(file for file, _ in usages)
                print(f"\n  {Colors.BOLD}{key}{Colors.ENDC} - used in {num_files} files:")
                for file in sorted(files):
                    print(f"    • {file}")
        else:
            print(f"  {Colors.OKGREEN}✓ All multi-file keys are appropriately placed{Colors.ENDC}")
        
        # Common.json usage analysis
        print(f"\n{Colors.OKBLUE}{Colors.BOLD}📋 Common.json Analysis{Colors.ENDC}")
        if 'common' in results['multi_file_keys']:
            common_multi = results['multi_file_keys']['common']
            print(f"  Keys used in multiple files: {len(common_multi)}")
            
            # Show top 10 most used common keys
            common_multi_sorted = sorted(common_multi, 
                                        key=lambda x: len(set(f for f, _ in x[1])), 
                                        reverse=True)
            if common_multi_sorted:
                print(f"\n  {Colors.OKGREEN}Top 10 most reused common keys:{Colors.ENDC}")
                for key, usages in common_multi_sorted[:10]:
                    num_files = len(set(file for file, _ in usages))
                    print(f"    {key.replace('common.', '')}: {num_files} files")
        
        if 'common' in results['single_file_keys']:
            common_single = results['single_file_keys']['common']
            if common_single:
                print(f"\n  {Colors.WARNING}Keys used in only one file: {len(common_single)}{Colors.ENDC}")
                print(f"    (These might not need to be in common.json)")
                for key, usages in common_single[:10]:
                    file, line = usages[0]
                    print(f"    • {key.replace('common.', '')}: {file}")
                if len(common_single) > 10:
                    print(f"    ... and {len(common_single) - 10} more")
        
        # Unused keys summary
        print(f"\n{Colors.OKBLUE}{Colors.BOLD}❌ Unused Translation Keys{Colors.ENDC}")
        total_unused = sum(len(keys) for keys in results['unused_keys'].values())
        
        if total_unused > 0:
            print(f"  {Colors.WARNING}Found {total_unused} unused keys across all namespaces{Colors.ENDC}")
            print(f"  {Colors.WARNING}(These translations exist but are not referenced in the code){Colors.ENDC}\n")
            for namespace, keys in sorted(results['unused_keys'].items()):
                if keys:
                    percentage = len(keys) * 100 // len(self.translation_keys[namespace])
                    print(f"  {Colors.BOLD}{namespace}.json:{Colors.ENDC} {len(keys)} unused ({percentage}%)")
        else:
            print(f"  {Colors.OKGREEN}✓ All translation keys are being used!{Colors.ENDC}")
        
        # Namespace statistics
        print(f"\n{Colors.OKBLUE}{Colors.BOLD}📈 Per-Namespace Statistics{Colors.ENDC}\n")
        for namespace in sorted(self.translation_keys.keys()):
            keys = self.translation_keys[namespace]
            used = sum(1 for key in keys if self.key_usage.get(key))
            multi_file = len([k for k, _ in results['multi_file_keys'].get(namespace, [])])
            unused = len(results['unused_keys'].get(namespace, []))
            
            print(f"  {Colors.BOLD}{namespace}.json:{Colors.ENDC}")
            print(f"    Total keys: {len(keys)}")
            print(f"    Used: {used} ({used*100//len(keys) if len(keys) else 0}%)")
            print(f"    Unused: {unused} ({unused*100//len(keys) if len(keys) else 0}%)")
            print(f"    Multi-file usage: {multi_file}")
            print()
        
        print(f"{Colors.HEADER}{'='*80}{Colors.ENDC}\n")
    
    def generate_recommendations(self, results: Dict) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        # Recommend moving keys to common
        cross_namespace = results['cross_namespace_usage']
        if cross_namespace:
            recommendations.append(
                f"✅ Move {len(cross_namespace)} keys to common.json "
                f"(keys used in multiple files from non-common namespaces)"
            )
            for key in sorted(cross_namespace.keys()):
                recommendations.append(f"   - {key}")
        
        # Recommend removing unused keys (but note they might be work in progress)
        total_unused = sum(len(keys) for keys in results['unused_keys'].values())
        if total_unused > 0:
            recommendations.append(
                f"⚠️  Review {total_unused} unused translation keys "
                f"(may be for features not yet implemented)"
            )
        
        # Check for keys in common that are only used once
        if 'common' in results['single_file_keys']:
            single_use_common = len(results['single_file_keys']['common'])
            if single_use_common > 0:
                recommendations.append(
                    f"🔍 Review {single_use_common} common.json keys that are only used in one file "
                    f"(consider moving to namespace-specific files)"
                )
        
        return recommendations

def main():
    # Determine base path
    script_dir = Path(__file__).parent
    base_path = script_dir.parent
    
    print(f"{Colors.HEADER}Starting i18n Translation Usage Analysis...{Colors.ENDC}\n")
    print(f"Base path: {base_path}\n")
    
    analyzer = TranslationUsageAnalyzer(str(base_path))
    
    print("📚 Loading translation keys from zh-TW...")
    analyzer.load_translation_keys()
    
    total_keys = sum(len(keys) for keys in analyzer.translation_keys.values())
    print(f"   Loaded {total_keys} keys from {len(analyzer.translation_keys)} namespaces\n")
    
    print("🔍 Scanning source files for usage...")
    analyzer.scan_source_files()
    
    print(f"   Found {len(analyzer.key_usage)} unique key usages\n")
    
    print("📊 Analyzing usage patterns...")
    results = analyzer.analyze()
    
    # Print report
    analyzer.print_report(results)
    
    # Generate recommendations
    recommendations = analyzer.generate_recommendations(results)
    
    if recommendations:
        print(f"{Colors.OKBLUE}{Colors.BOLD}💡 Recommendations{Colors.ENDC}\n")
        for rec in recommendations:
            print(f"  {rec}")
        print()
    
    print(f"{Colors.OKGREEN}✅ Analysis complete!{Colors.ENDC}\n")
    print(f"Use this analysis to:")
    print(f"  1. Move frequently reused keys to common.json")
    print(f"  2. Identify keys that can be removed (if unused)")
    print(f"  3. Ensure translation organization follows best practices\n")

if __name__ == '__main__':
    main()
