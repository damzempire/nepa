// Database Index Monitor
// This class provides monitoring capabilities for database indexes across all services

export class DatabaseIndexMonitor {
  private userPrisma: PrismaClient;
  private auditPrisma: PrismaClient;
  private paymentPrisma: PrismaClient;
  private billingPrisma: PrismaClient;

  constructor() {
    this.userPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.USER_SERVICE_DATABASE_URL
        }
      }
    });

    this.auditPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.AUDIT_DATABASE_URL
        }
      }
    });

    this.paymentPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.PAYMENT_SERVICE_DATABASE_URL
        }
      }
    });

    this.billingPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.BILLING_SERVICE_DATABASE_URL
        }
      }
    });
  }

  async getIndexUsageStats(service: 'user' | 'audit' | 'payment' | 'billing'): Promise<any[]> {
    const prisma = this.getPrismaClient(service);
    
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          num_tup_reads,
          num_tup_fetches,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes 
        ORDER BY idx_scan DESC, idx_tup_read DESC
      `;
      
      return result as any[];
    } catch (error) {
      console.error(`Error getting index stats for ${service} service:`, error);
      return [];
    }
  }

  async getUnusedIndexes(service: 'user' | 'audit' | 'payment' | 'billing'): Promise<any[]> {
    const prisma = this.getPrismaClient(service);
    
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes 
        WHERE idx_scan = 0 
        ORDER BY pg_relation_size(indexrelid) DESC
      `;
      
      return result as any[];
    } catch (error) {
      console.error(`Error getting unused indexes for ${service} service:`, error);
      return [];
    }
  }

  async getSlowQueries(service: 'user' | 'audit' | 'payment' | 'billing'): Promise<any[]> {
    const prisma = this.getPrismaClient(service);
    
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements 
        WHERE mean_time > 100 
        ORDER BY mean_time DESC 
        LIMIT 10
      `;
      
      return result as any[];
    } catch (error) {
      console.error(`Error getting slow queries for ${service} service:`, error);
      return [];
    }
  }

  async getTableSizeStats(service: 'user' | 'audit' | 'payment' | 'billing'): Promise<any[]> {
    const prisma = this.getPrismaClient(service);
    
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
          (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) / pg_total_relation_size(schemaname||'.'||tablename) * 100 as index_ratio
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;
      
      return result as any[];
    } catch (error) {
      console.error(`Error getting table size stats for ${service} service:`, error);
      return [];
    }
  }

  async generateIndexRecommendations(service: 'user' | 'audit' | 'payment' | 'billing'): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      // Get unused indexes
      const unusedIndexes = await this.getUnusedIndexes(service);
      if (unusedIndexes.length > 0) {
        recommendations.push(`Found ${unusedIndexes.length} unused indexes in ${service} service:`);
        unusedIndexes.forEach(index => {
          recommendations.push(`  - Consider dropping: ${index.indexname} on ${index.tablename} (${index.index_size})`);
        });
      }

      // Get slow queries
      const slowQueries = await this.getSlowQueries(service);
      if (slowQueries.length > 0) {
        recommendations.push(`Found ${slowQueries.length} slow queries in ${service} service:`);
        slowQueries.forEach(query => {
          recommendations.push(`  - Query avg time: ${query.mean_time}ms, calls: ${query.calls}`);
        });
      }

      // Get table stats
      const tableStats = await this.getTableSizeStats(service);
      tableStats.forEach(table => {
        if (parseFloat(table.index_ratio) > 50) {
          recommendations.push(`  - High index ratio on ${table.tablename}: ${table.index_ratio}% (${table.index_size} indexes)`);
        }
      });

    } catch (error) {
      console.error(`Error generating recommendations for ${service} service:`, error);
    }

    return recommendations;
  }

  async getComprehensiveReport(): Promise<any> {
    const services = ['user', 'audit', 'payment', 'billing'] as const;
    const report: any = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    for (const service of services) {
      try {
        report.services[service] = {
          indexUsage: await this.getIndexUsageStats(service),
          unusedIndexes: await this.getUnusedIndexes(service),
          slowQueries: await this.getSlowQueries(service),
          tableStats: await this.getTableSizeStats(service),
          recommendations: await this.generateIndexRecommendations(service)
        };
      } catch (error) {
        console.error(`Error generating report for ${service} service:`, error);
        report.services[service] = { error: error.message };
      }
    }

    return report;
  }

  private getPrismaClient(service: 'user' | 'audit' | 'payment' | 'billing'): PrismaClient {
    switch (service) {
      case 'user': return this.userPrisma;
      case 'audit': return this.auditPrisma;
      case 'payment': return this.paymentPrisma;
      case 'billing': return this.billingPrisma;
      default: throw new Error(`Unknown service: ${service}`);
    }
  }

  async cleanup() {
    await this.userPrisma.$disconnect();
    await this.auditPrisma.$disconnect();
    await this.paymentPrisma.$disconnect();
    await this.billingPrisma.$disconnect();
  }
}
