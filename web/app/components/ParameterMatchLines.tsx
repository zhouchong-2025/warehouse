import type { ParameterMatchRow } from '@/lib/parameter-match-summary';

export default function ParameterMatchLines({rows}: {rows:readonly ParameterMatchRow[]}) {
  if (!rows.length) return null;
  return <dl aria-label="参数与要求对照" className="mb-2 space-y-1 text-xs">
    {rows.map(item => <div key={item.id}>
      <dt className="inline text-[#c9d1d9]">{item.label}</dt>
      <dd className="inline"> <strong className="text-[#a5e6f5]">{item.value}</strong>
        <p className={item.unmatched ? 'text-[#ff7b72]' : 'text-[#8b949e]'}>{item.comparison}</p>
      </dd>
    </div>)}
  </dl>;
}
