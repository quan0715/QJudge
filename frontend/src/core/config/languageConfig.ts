
type LanguageConfig = {
    field: string;
    label: string;
}
export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
    'cpp': {
        field: 'cpp',
        label: 'C++',
    },
    'python': {
        field: 'python',
        label: 'Python',
    },
    'java': {
        field: 'java',
        label: 'Java',
    },
    'javascript': {
        field: 'javascript',
        label: 'JavaScript',
    },
    'c': {
        field: 'c',
        label: 'C',
    }
}

export function getLanguageConfig(language: string): LanguageConfig {
    return LANGUAGE_CONFIG[language] || { field: language, label: language };
}
