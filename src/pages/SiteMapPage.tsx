import React from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_ROUTES, PublicRoute } from '../data/siteRoutes.ts';

const GROUPS: PublicRoute['group'][] = ['Explorar', 'Cuenta', 'Ayuda', 'Legal'];

export function SiteMapPage() {
  return (
    <div className="mx-auto max-w-4xl px-1 py-6 sm:py-10">
      <h1 className="font-display text-4xl tracking-tight text-slate-900">Mapa del sitio</h1>
      <p className="mt-2 text-sm text-slate-600">Todas las páginas públicas de Spotly.</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-900">{group}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {PUBLIC_ROUTES.filter((r) => r.group === group).map((route) => (
                <li key={route.path}>
                  <Link to={route.path} className="text-slate-700 underline-offset-2 hover:text-rose-700 hover:underline">
                    {route.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
