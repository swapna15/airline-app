import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-5xl font-bold text-gray-200 mb-4">403</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500 text-sm mb-6">You don't have permission to view this page.</p>
        <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 transition-colors">
          Go home
        </Link>
      </div>
    </div>
  );
}
