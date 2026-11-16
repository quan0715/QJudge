import {readDocsSource} from "@popcornt/mimi/content";
export const source=readDocsSource({contentDir:process.env.DOCS_CONTENT_DIR||"../frontend/public/docs"});
