import {source} from "../source.server";
import {loadDocsHome} from "@popcornt/mimi/react-router";
export {DocsHome as default,docsMeta as meta} from "@popcornt/mimi/react-router";
export const loader=()=>loadDocsHome(source);
