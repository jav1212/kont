"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
    const router = useRouter();

    return (
        <div 
            className="flex flex-col items-center justify-center min-h-screen bg-white"
            role="status"
            aria-label="Cargando aplicación"
        >
            <div className="relative flex items-center justify-center">
                {/* Spinner Animado */}
                <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            
            <p className="mt-4 text-gray-500 font-medium animate-pulse">
                Verificando sesión...
            </p>
        </div>
    );
}