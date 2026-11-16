import {Links,Meta,Outlet,Scripts,ScrollRestoration,useMatches} from 'react-router';
import '@popcornt/mimi/styles.css';
export function Layout({children}:{children:React.ReactNode}) {const matches=useMatches();const data=matches.at(-1)?.data as {page?:{requestedLocale:string}}|undefined;return <html lang={data?.page?.requestedLocale||'zh-TW'}><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><Meta/><Links/></head><body style={{margin:0}}>{children}<ScrollRestoration/><Scripts/></body></html>;}
export default function App(){return <Outlet/>;}
export function ErrorBoundary(){return <main><h1>404</h1><p>找不到文件 / Document not found</p><a href="/">首頁 / Home</a></main>;}
