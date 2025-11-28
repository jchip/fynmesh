import React, { useState, useMemo, useCallback, useRef } from 'react';
// @ts-ignore - esm wrapper
import { AgGridReact } from 'esm-ag-grid-react';
// @ts-ignore - esm wrapper
import type { ColDef, GridReadyEvent, GridApi, ValueFormatterParams } from 'esm-ag-grid';
// @ts-ignore - esm wrapper
import { AllCommunityModule, ModuleRegistry } from 'esm-ag-grid';
import { orderData, type OrderData } from './data';
import './styles.css';

// Register AG Grid Community modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface AppProps {
  appName: string;
}

// Status cell renderer with colored badges
const StatusCellRenderer = (props: { value: string }) => {
  const statusColors: Record<string, { bg: string; text: string }> = {
    'Pending': { bg: '#fef3c7', text: '#92400e' },
    'Processing': { bg: '#dbeafe', text: '#1e40af' },
    'Shipped': { bg: '#e0e7ff', text: '#3730a3' },
    'Delivered': { bg: '#d1fae5', text: '#065f46' },
    'Cancelled': { bg: '#fee2e2', text: '#991b1b' },
  };
  const colors = statusColors[props.value] || { bg: '#f3f4f6', text: '#374151' };

  return (
    <span style={{
      backgroundColor: colors.bg,
      color: colors.text,
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 500,
    }}>
      {props.value}
    </span>
  );
};

const App: React.FC<AppProps> = ({ appName }) => {
  const gridRef = useRef<AgGridReact>(null);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [rowData] = useState<OrderData[]>(orderData);
  const [selectedRows, setSelectedRows] = useState<OrderData[]>([]);

  // Currency formatter
  const currencyFormatter = (params: ValueFormatterParams): string => {
    if (params.value == null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(params.value);
  };

  // Date formatter
  const dateFormatter = (params: ValueFormatterParams): string => {
    if (!params.value) return '';
    return new Date(params.value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Column definitions
  const columnDefs = useMemo<ColDef<OrderData>[]>(() => [
    {
      headerName: '',
      field: 'orderId',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 50,
      pinned: 'left',
      lockPosition: true,
    },
    {
      headerName: 'Order ID',
      field: 'orderId',
      filter: 'agTextColumnFilter',
      width: 130,
      pinned: 'left',
    },
    {
      headerName: 'Date',
      field: 'orderDate',
      filter: 'agDateColumnFilter',
      valueFormatter: dateFormatter,
      width: 120,
      sort: 'desc',
    },
    {
      headerName: 'Status',
      field: 'status',
      filter: 'agTextColumnFilter',
      cellRenderer: StatusCellRenderer,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      },
      width: 120,
    },
    {
      headerName: 'Customer',
      field: 'customerName',
      filter: 'agTextColumnFilter',
      width: 150,
    },
    {
      headerName: 'Email',
      field: 'customerEmail',
      filter: 'agTextColumnFilter',
      width: 200,
    },
    {
      headerName: 'Region',
      field: 'region',
      filter: 'agTextColumnFilter',
      width: 130,
    },
    {
      headerName: 'Product',
      field: 'product',
      filter: 'agTextColumnFilter',
      width: 160,
    },
    {
      headerName: 'Category',
      field: 'category',
      filter: 'agTextColumnFilter',
      width: 130,
    },
    {
      headerName: 'Qty',
      field: 'quantity',
      filter: 'agNumberColumnFilter',
      editable: true,
      width: 80,
      type: 'numericColumn',
    },
    {
      headerName: 'Unit Price',
      field: 'unitPrice',
      filter: 'agNumberColumnFilter',
      valueFormatter: currencyFormatter,
      width: 110,
      type: 'numericColumn',
    },
    {
      headerName: 'Total',
      field: 'totalAmount',
      filter: 'agNumberColumnFilter',
      valueFormatter: currencyFormatter,
      width: 120,
      type: 'numericColumn',
      cellStyle: { fontWeight: 600 },
    },
  ], []);

  // Default column properties
  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    filter: true,
  }), []);

  // Grid ready handler
  const onGridReady = useCallback((params: GridReadyEvent) => {
    setGridApi(params.api);
  }, []);

  // Selection changed handler
  const onSelectionChanged = useCallback(() => {
    if (gridApi) {
      const selected = gridApi.getSelectedRows();
      setSelectedRows(selected);
    }
  }, [gridApi]);

  // Export to CSV
  const exportToCsv = useCallback(() => {
    if (gridApi) {
      gridApi.exportDataAsCsv({
        fileName: `orders-export-${new Date().toISOString().split('T')[0]}.csv`,
      });
    }
  }, [gridApi]);

  // Clear filters
  const clearFilters = useCallback(() => {
    if (gridApi) {
      gridApi.setFilterModel(null);
    }
  }, [gridApi]);

  // Calculate totals
  const totals = useMemo(() => {
    const data = selectedRows.length > 0 ? selectedRows : rowData;
    return {
      orders: data.length,
      items: data.reduce((sum, row) => sum + row.quantity, 0),
      revenue: data.reduce((sum, row) => sum + row.totalAmount, 0),
    };
  }, [rowData, selectedRows]);

  return (
    <div className="ag-grid-app">
      <header className="app-header">
        <div>
          <h1>{appName}</h1>
          <p className="subtitle">Enterprise Data Grid Demo - AG Grid Community</p>
        </div>
        <div className="header-actions">
          <button onClick={clearFilters} className="btn btn-secondary">
            Clear Filters
          </button>
          <button onClick={exportToCsv} className="btn btn-primary">
            Export CSV
          </button>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-label">Orders</span>
          <span className="stat-value">{totals.orders.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Items</span>
          <span className="stat-value">{totals.items.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Revenue</span>
          <span className="stat-value">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.revenue)}
          </span>
        </div>
        {selectedRows.length > 0 && (
          <div className="stat selected">
            <span className="stat-label">Selected</span>
            <span className="stat-value">{selectedRows.length} rows</span>
          </div>
        )}
      </div>

      <div className="grid-container ag-theme-alpine">
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          rowSelection="multiple"
          suppressRowClickSelection={true}
          pagination={true}
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200, 500]}
          animateRows={true}
          enableCellTextSelection={true}
        />
      </div>

      <footer className="app-footer">
        <p>
          AG Grid Community {React.version} | {rowData.length} total orders |
          Double-click Status or Qty to edit
        </p>
      </footer>
    </div>
  );
};

export default App;
