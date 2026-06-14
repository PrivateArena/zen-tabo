# Zen-Tabo HTTP Agent API Reference

Zen-Tabo provides a lightweight, local HTTP API allowing AI agents and external tools in the `zen-*` ecosystem to query, edit, and analyze spreadsheets directly from the terminal or background scripts.

The API runs directly on the Vite development server (usually at `http://localhost:5173`) and proxies queries to the active browser tab via the Vite WebSocket (HMR) connection.

> [!IMPORTANT]
> **Active Browser Tab Required**: For API calls to succeed, the Zen-Tabo spreadsheet interface must be open in a browser tab. If no tab is connected, requests will return a `504 Gateway Timeout`.

---

## Content Formats

All analytical endpoints support two output formats:
1. **JSON** (Default): Standard structured JSON.
2. **Markdown** (Token-Friendly): Renders results directly as a markdown table. This format is highly recommended for AI agents to minimize token consumption and improve comprehension.

To request Markdown format, either:
* Append `?format=markdown` to the URL.
* Add the HTTP Header: `Accept: text/markdown`.

---

## Endpoint Specifications

### 1. Retrieve Sheet Schema
Returns dimensions and column metadata (names, types, formulas).

* **Endpoint**: `GET /api/schema`
* **Query Parameters**:
  * `format` (optional): `json` or `markdown`

#### Response Examples
##### JSON (`GET /api/schema`)
```json
{
  "totalRows": 100000,
  "totalCols": 10,
  "columns": [
    { "index": 0, "letter": "A", "name": "RowID", "type": "number", "formula": null },
    { "index": 5, "letter": "F", "name": "Revenue", "type": "number", "formula": "Units * Price" }
  ]
}
```

##### Markdown (`GET /api/schema?format=markdown`)
```markdown
### Zen-Tabo Sheet Schema
* **Dimensions**: 100,000 rows x 10 columns

| Col Index | Letter | Name | Type | Formula |
| --- | --- | --- | --- | --- |
| 0 | **A** | RowID | `number` | _None_ |
| 5 | **F** | Revenue | `number` | `Units * Price` |
```

---

### 2. Execute SQL Queries
Runs analytical queries against the underlying high-performance DuckDB-Wasm engine in the browser.

* **Endpoint**: `POST /api/query`
* **Query Parameters**:
  * `format` (optional): `json` or `markdown`
* **Request Body**:
  ```json
  {
    "sql": "SELECT Region, COUNT(*) as Count, SUM(Revenue) as TotalRevenue FROM active_sheet GROUP BY Region"
  }
  ```

#### Response Examples
##### JSON (`POST /api/query`)
```json
{
  "columns": ["Region", "Count", "TotalRevenue"],
  "rows": [
    ["North", 25000, 312500.5],
    ["South", 75000, 937500.2]
  ]
}
```

##### Markdown (`POST /api/query` with `Accept: text/markdown`)
```markdown
### Query Results (2 rows)

| Region | Count | TotalRevenue |
| --- | --- | --- |
| North | 25000 | 312500.5 |
| South | 75000 | 937500.2 |
```

---

### 3. Retrieve Column Statistics
Fetches summary statistics (min, max, median, standard deviation) for all numerical columns.

* **Endpoint**: `GET /api/stats`
* **Query Parameters**:
  * `format` (optional): `json` or `markdown`

#### Response Examples
##### Markdown (`GET /api/stats?format=markdown`)
```markdown
### Column Statistics Summary

| Column | Count | Mean | Median | Min | Max | Std Dev |
| --- | --- | --- | --- | --- | --- | --- |
| **Units** | 100000 | 79.50 | 79.00 | 5.00 | 154.00 | 43.30 |
| **Revenue** | 100000 | 9481.25 | 9200.00 | 62.50 | 33880.00 | 2540.10 |
```

---

### 4. Edit Cell or Column Formula
Modifies a cell value or updates a column-level formula. Recalculation is automatically triggered across all dependent columns.

* **Endpoint**: `POST /api/edit`
* **Request Body**:
  * **Cell Update**:
    ```json
    {
      "col": 5,
      "row": 0,
      "val": "100.0"
    }
    ```
  * **Column Formula Update**:
    ```json
    {
      "col": 8,
      "formula": "Revenue - TaxAmount"
    }
    ```

#### Response Example (JSON)
```json
{
  "success": true,
  "message": "Cell at row 0, col 5 successfully updated to: 100.0"
}
```

---

## Integration Examples

### Bash / Curl
```bash
# Get Schema as Markdown
curl -H "Accept: text/markdown" http://localhost:5173/api/schema

# Run SQL Aggregation and Output Markdown Table
curl -X POST -H "Content-Type: application/json" \
     -H "Accept: text/markdown" \
     -d '{"sql": "SELECT Region, AVG(Revenue) FROM active_sheet GROUP BY Region"}' \
     http://localhost:5173/api/query
```

### Python
```python
import urllib.request
import json

# Edit a column formula
req = urllib.request.Request(
    "http://localhost:5173/api/edit",
    data=json.dumps({"col": 8, "formula": "Revenue * 0.9"}).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(req) as res:
    print(res.read().decode())
```
