import { z } from "zod";

const aggregateSchema = z.enum(["sum", "avg", "count"]);
const widgetKindSchema = z.enum([
  "kpi",
  "bar",
  "stacked_bar",
  "line",
  "pie",
  "table",
  "filter_dropdown",
  "date_range"
]);

export const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: widgetKindSchema,
  sheetName: z.string().min(1),
  layout: z.object({
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(12)
  }),
  xField: z.string().min(1).optional(),
  yField: z.string().min(1).optional(),
  groupBy: z.string().min(1).optional(),
  aggregate: aggregateSchema.optional(),
  metricField: z.string().min(1).optional(),
  filterField: z.string().min(1).optional(),
  dateField: z.string().min(1).optional(),
  columns: z.array(z.string().min(1)).max(100).optional(),
  valueFields: z.array(z.string().min(1)).max(100).optional(),
  seriesField: z.string().min(1).optional(),
  matchField: z.string().min(1).optional(),
  matchValue: z.string().min(1).optional(),
  dateGranularity: z.enum(["day", "week", "month"]).optional(),
  description: z.string().optional()
});

export const dashboardFilterSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("select"),
    field: z.string().min(1),
    value: z.string().nullable().optional()
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("date_range"),
    field: z.string().min(1),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional()
  })
]);

export const dashboardPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    datasetId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    isDefault: z.boolean().optional(),
    config: z.object({
      datasetId: z.string().min(1),
      widgets: z.array(dashboardWidgetSchema).max(200),
      filters: z.array(dashboardFilterSchema).max(100)
    })
  })
  .refine((payload) => payload.datasetId === payload.config.datasetId, {
    message: "Dashboard datasetId must match config.datasetId.",
    path: ["config", "datasetId"]
  })
  .superRefine((payload, context) => {
    const widgetIds = payload.config.widgets.map((widget) => widget.id);
    if (new Set(widgetIds).size !== widgetIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Widget IDs must be unique.",
        path: ["config", "widgets"]
      });
    }

    const filterIds = payload.config.filters.map((filter) => filter.id);
    if (new Set(filterIds).size !== filterIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Filter IDs must be unique.",
        path: ["config", "filters"]
      });
    }
  });

export const widgetQuerySchema = z.object({
  datasetId: z.string().min(1),
  widget: dashboardWidgetSchema,
  filters: z.array(dashboardFilterSchema).max(100).default([])
});
