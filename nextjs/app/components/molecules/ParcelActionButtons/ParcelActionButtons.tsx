type ParcelActionButtonsProps = {
    ndviFetching: boolean;
    ndviDone: number;
    ndviTotal: number;
    tableOpen: boolean;
    onFetchNdvi: () => void;
    onToggleTable: () => void;
    onSelectAll: () => void;
};

export function ParcelActionButtons({
    ndviFetching,
    ndviDone,
    ndviTotal,
    tableOpen,
    onFetchNdvi,
    onToggleTable,
    onSelectAll,
}: ParcelActionButtonsProps) {
    return (
        <div className="s1-results-actions">
            <button
                className="s1-action-btn"
                onClick={onFetchNdvi}
                disabled={ndviFetching}
                title="ดึง NDVI จาก Google Earth Engine (สูงสุด 20 แปลง)"
            >
                {ndviFetching
                    ? <><span className="spinner-border spinner-border-sm" style={{ width: 11, height: 11 }} /> {ndviDone}/{ndviTotal}</>
                    : <><i className="bi bi-globe2"></i> NDVI</>}
            </button>

            <button className="s1-action-btn" onClick={onToggleTable}>
                <i className="bi bi-table"></i>
                {tableOpen ? "ซ่อนตาราง" : "ดูตาราง"}
                <i className={`bi bi-chevron-${tableOpen ? "up" : "down"}`}></i>
            </button>

            <button
                className="s1-action-btn"
                onClick={onSelectAll}
                title="เลือกทุกแปลง"
            >
                <i className="bi bi-check-all"></i> ทั้งหมด
            </button>
        </div>
    );
}
