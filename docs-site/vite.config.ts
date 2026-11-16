import {defineConfig} from 'vite';
import {reactRouter} from '@react-router/dev/vite';
export default defineConfig({plugins:[reactRouter()],ssr:{noExternal:['@popcornt/mimi','@carbon/react','@carbon/icons-react']}});
