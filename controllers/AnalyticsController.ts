import { Request, Response } from 'express';
import { AnalyticsService } from '../AnalyticsService';

const analyticsService = new AnalyticsService();

/**
 * @openapi
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get analytics dashboard data
 *     description: Retrieve comprehensive analytics data including billing stats, revenue charts, user growth, and predictions
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRevenue:
 *                       type: number
 *                     overdueBills:
 *                       type: number
 *                     pendingBills:
 *                       type: number
 *                 charts:
 *                   type: object
 *                   properties:
 *                     revenue:
 *                       type: array
 *                     userGrowth:
 *                       type: array
 *                 prediction:
 *                   type: object
 *       500:
 *         description: Failed to fetch dashboard data
 */
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const [stats, revenueChart, userGrowth, prediction] = await Promise.all([
      analyticsService.getBillingStats(),
      analyticsService.getDailyRevenue(30),
      analyticsService.getUserGrowth(30),
      analyticsService.predictRevenue()
    ]);

    res.json({
      summary: stats,
      charts: {
        revenue: revenueChart,
        userGrowth: userGrowth
      },
      prediction
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

/**
 * @openapi
 * /api/analytics/reports:
 *   post:
 *     summary: Generate and save a custom report
 *     description: Create a new report based on specified type and save it to the database
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - type
 *               - userId
 *             properties:
 *               title:
 *                 type: string
 *                 description: Report title
 *               type:
 *                 type: string
 *                 enum: [REVENUE, USER_GROWTH, BILLING]
 *                 description: Type of report to generate
 *               userId:
 *                 type: string
 *                 description: User ID creating the report
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Failed to generate report
 */
export const generateReport = async (req: Request, res: Response) => {
  try {
    const { title, type, userId } = req.body;
    
    let data;
    if (type === 'REVENUE') {
      data = await analyticsService.getDailyRevenue(30);
    } else if (type === 'USER_GROWTH') {
      data = await analyticsService.getUserGrowth(30);
    } else {
      data = await analyticsService.getBillingStats();
    }

    const report = await analyticsService.saveReport(userId, title, type, data);
    res.status(201).json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

/**
 * @openapi
 * /api/analytics/export:
 *   get:
 *     summary: Export analytics data
 *     description: Export data in CSV or JSON format with optional date filtering
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *         description: Export format
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [revenue, users, bills]
 *           default: revenue
 *         description: Type of data to export
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Data exported successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 *       500:
 *         description: Failed to export data
 */
export const exportData = async (req: Request, res: Response) => {
  try {
    const { format = 'csv', type = 'revenue', startDate, endDate } = req.query;
    
    let data;
    let filename;
    
    switch (type) {
      case 'revenue':
        data = await analyticsService.getRevenueData(
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );
        filename = `revenue_export.${format}`;
        break;
      case 'users':
        data = await analyticsService.getUserData(
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );
        filename = `users_export.${format}`;
        break;
      case 'bills':
        data = await analyticsService.getBillsData(
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );
        filename = `bills_export.${format}`;
        break;
      default:
        data = await analyticsService.getRevenueData();
        filename = `revenue_export.${format}`;
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.json(data);
    } else {
      const csv = analyticsService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
};