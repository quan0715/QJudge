import {source} from "../source.server";
import {loadDocsPage} from "@popcornt/mimi/react-router";
export {DocsArticle as default,docsMeta as meta} from "@popcornt/mimi/react-router";
export const loader=({params}:{params:Record<string,string|undefined>})=>loadDocsPage(source,params);
