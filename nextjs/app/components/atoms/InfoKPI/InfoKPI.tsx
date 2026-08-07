type InfoKPIProps = {
    value: string;
    label: string;
};

export function InfoKPI({ value, label }: InfoKPIProps) {
    return (
        <div className="s1-kpi">
            <div className="s1-kpi-value">{value}</div>
            <div className="s1-kpi-label">{label}</div>
        </div>
    );
}
