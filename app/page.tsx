import { SearchForm } from './search/SearchForm';

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col">
      {/* Hero */}
      <div className="bg-blue-600 text-white py-16 px-6 text-center">
        <h1 className="text-4xl font-bold mb-3">Where to next?</h1>
        <p className="text-blue-100 text-lg">Powered by AI agents — search, book, and get help instantly</p>
      </div>

      {/* Search card */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 -mt-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <SearchForm />
        </div>
      </div>
    </div>
  );
}
