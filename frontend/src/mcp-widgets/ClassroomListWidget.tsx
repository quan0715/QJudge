import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.scss';
import '@/styles/fonts.css';

function ClassroomListWidget() {
  const [classrooms, setClassrooms] = useState<any[] | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (msg?.jsonrpc === "2.0" && msg?.method === "ui/notifications/tool-result") {
        const data = msg.params?.structuredContent?.classrooms;
        if (data) {
          setClassrooms(data);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!classrooms) return <div className="p-4 text-gray-500 font-sans">Loading classrooms...</div>;

  if (classrooms.length === 0) {
    return <div className="p-4 text-gray-500 font-sans">No classrooms found.</div>;
  }

  return (
    <div className="p-4 font-sans bg-white dark:bg-gray-900 min-h-screen">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">My Classrooms</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {classrooms.map((c: any) => (
          <div key={c.classroom_id} className="p-4 border rounded-lg shadow-sm bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
            <h3 className="font-semibold text-lg text-blue-600 dark:text-blue-400">{c.name}</h3>
            {c.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{c.description}</p>}
            <div className="mt-3 text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 inline-block rounded">
              Role: {c.current_user_role}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<ClassroomListWidget />);
