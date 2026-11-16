import type {Config} from '@react-router/dev/config';
import {source} from './app/source.server';
import {writeDocsArtifacts} from '@popcornt/mimi/content';
export default {ssr:false,prerender:['/', '/404', ...source.routes().map(p=>p.replace(/\/$/,''))],buildEnd:async()=>{await writeDocsArtifacts(source,'build/client');}} satisfies Config;
