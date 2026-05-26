# Dashboard Builder

Dashboard Builder is a Next.js app for uploading Excel or CSV files, previewing and mapping column types, storing records in SQLite, and building customizable dashboards with drag-and-drop widgets.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- SQLite via `better-sqlite3`
- Excel parsing via `xlsx`
- Charts via `recharts`
- Tables via `@tanstack/react-table`
- Drag and drop via `@dnd-kit`
- Export via `html2canvas` + `jspdf`

## Features

- Upload `.xlsx`, `.xls`, `.csv`
- Parse multiple sheets
- Preview rows before import
- Override inferred column types: `text`, `number`, `date`, `category`
- Save dataset metadata and rows into SQLite
- Auto-generate a starter dashboard
- Widget types:
  - KPI card
  - Bar chart
  - Line chart
  - Pie chart
  - Data table
  - Filter dropdown
  - Date range filter
- Drag-and-drop widget ordering
- Widget configuration for X, Y, aggregate, filter field, table columns
- Save dashboard config as JSON
- Export dashboard to PNG or PDF
- Responsive sidebar layout for desktop and tablet
- Loading, empty, and error states
- Auth scaffold present but login not enforced

## Project Structure

```text
app/                  Next.js pages and API routes
components/           UI components for upload, builder, dashboard, shared shell
lib/                  Database, parsing, dashboard logic, types, utilities
database/schema.sql   SQLite schema reference
scripts/              Init and seed scripts
public/sample-data/   Example CSV data
```

## Install

```bash
npm install
```

## Initialize Database

```bash
npm run init-db
```

## Seed Example Data

```bash
npm run seed
```

This creates a sample dataset and an auto-generated dashboard based on `public/sample-data/sample-sales.csv`.

## Run Development Server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Main Pages

- `/upload` Upload and preview files before import
- `/datasets` Browse imported datasets
- `/builder` Edit dashboard widgets and layout
- `/dashboards/[id]` View and export a dashboard
- `/settings` App settings and auth scaffold status

## Database Notes

- Row data is stored per sheet in `dataset_rows.data_json`
- Column metadata is stored in `dataset_columns`
- Dashboard definitions are stored in `dashboards.config_json`
- SQLite database file is created at `data/dashboard.db`

## Production Notes

- Current query engine aggregates data in application code after loading dataset rows from SQLite
- This is suitable for initial deployments and moderate datasets
- For larger datasets, the next step is materialized typed tables or a query engine layer per dataset
- Auth scaffolding exists in `lib/auth.ts` and can be replaced with NextAuth/Auth.js or custom session middleware
