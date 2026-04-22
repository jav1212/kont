import type { ServiceWithStatus } from "../hooks/use-status-services";
import { ServiceRow } from "./service-row";

interface Props {
    title: string;
    services: ServiceWithStatus[];
    hrefBase: string;
}

export function CategorySection({ title, services, hrefBase }: Props) {
    if (!services.length) return null;
    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60 flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                {title}
                <span className="text-foreground/30 font-normal">({services.length})</span>
            </h3>
            <div className="flex flex-col gap-2">
                {services.map((s) => (
                    <ServiceRow key={s.id} service={s} hrefBase={hrefBase} />
                ))}
            </div>
        </section>
    );
}
