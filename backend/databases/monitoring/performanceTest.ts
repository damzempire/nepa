// Database Performance Testing Script
// This script provides performance testing capabilities for database indexes

export interface PerformanceTestResult {
  testName: string;
  query: string;
  executionTime: number;
  rowsReturned: number;
  indexUsed?: string;
  recommendations?: string[];
}

export class DatabasePerformanceTester {
  private connection: any; // Database connection would be injected

  constructor(connection: any) {
    this.connection = connection;
  }

  async testUserQueries(): Promise<PerformanceTestResult[]> {
    const tests = [
      {
        name: 'User Lookup by Email',
        query: 'SELECT * FROM "User" WHERE email = $1 LIMIT 1',
        params: ['test@example.com']
      },
      {
        name: 'User Lookup by Username',
        query: 'SELECT * FROM "User" WHERE username = $1 LIMIT 1',
        params: ['testuser']
      },
      {
        name: 'Active Users with Role',
        query: 'SELECT * FROM "User" WHERE status = $1 AND role = $2 ORDER BY createdAt DESC',
        params: ['ACTIVE', 'USER']
      },
      {
        name: 'User Sessions Lookup',
        query: 'SELECT * FROM "UserSession" WHERE userId = $1 AND isActive = $2',
        params: ['user-id', true]
      },
      {
        name: 'Recent Audit Logs',
        query: 'SELECT * FROM "AuditLog" WHERE userId = $1 ORDER BY createdAt DESC LIMIT 10',
        params: ['user-id']
      },
      {
        name: 'Payment History',
        query: 'SELECT * FROM "Payment" WHERE userId = $1 ORDER BY createdAt DESC',
        params: ['user-id']
      },
      {
        name: 'Bill Lookup by Status',
        query: 'SELECT * FROM "Bill" WHERE userId = $1 AND status = $2',
        params: ['user-id', 'PENDING']
      }
    ];

    const results: PerformanceTestResult[] = [];

    for (const test of tests) {
      const result = await this.runPerformanceTest(test.name, test.query, test.params);
      results.push(result);
    }

    return results;
  }

  async testCompositeIndexes(): Promise<PerformanceTestResult[]> {
    const tests = [
      {
        name: 'User Email + Status Lookup',
        query: 'SELECT * FROM "User" WHERE email = $1 AND status = $2',
        params: ['test@example.com', 'ACTIVE']
      },
      {
        name: 'User Role + Status Lookup',
        query: 'SELECT * FROM "User" WHERE role = $1 AND status = $2',
        params: ['USER', 'ACTIVE']
      },
      {
        name: 'Session Active + Expiry Lookup',
        query: 'SELECT * FROM "UserSession" WHERE isActive = $1 AND expiresAt > $2',
        params: [true, new Date()]
      },
      {
        name: 'Payment Status + Date Lookup',
        query: 'SELECT * FROM "Payment" WHERE status = $1 AND createdAt >= $2',
        params: ['PENDING', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
      },
      {
        name: 'Bill Status + Due Date Lookup',
        query: 'SELECT * FROM "Bill" WHERE status = $1 AND dueDate <= $2',
        params: ['PENDING', new Date()]
      },
      {
        name: 'Audit User + Date Range',
        query: 'SELECT * FROM "AuditLog" WHERE userId = $1 AND createdAt >= $2 AND createdAt <= $3',
        params: ['user-id', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date()]
      }
    ];

    const results: PerformanceTestResult[] = [];

    for (const test of tests) {
      const result = await this.runPerformanceTest(test.name, test.query, test.params);
      results.push(result);
    }

    return results;
  }

  async testIndexEffectiveness(): Promise<PerformanceTestResult[]> {
    const tests = [
      {
        name: 'EXPLAIN User Email Lookup',
        query: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "User" WHERE email = $1',
        params: ['test@example.com']
      },
      {
        name: 'EXPLAIN User Session Lookup',
        query: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "UserSession" WHERE userId = $1 AND isActive = $2',
        params: ['user-id', true]
      },
      {
        name: 'EXPLAIN Payment User History',
        query: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "Payment" WHERE userId = $1 ORDER BY createdAt DESC',
        params: ['user-id']
      },
      {
        name: 'EXPLAIN Audit Logs Query',
        query: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "AuditLog" WHERE userId = $1 AND createdAt >= $2 ORDER BY createdAt DESC',
        params: ['user-id', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
      }
    ];

    const results: PerformanceTestResult[] = [];

    for (const test of tests) {
      const result = await this.runPerformanceTest(test.name, test.query, test.params);
      results.push(result);
    }

    return results;
  }

  private async runPerformanceTest(testName: string, query: string, params: any[] = []): Promise<PerformanceTestResult> {
    const startTime = performance.now();
    
    try {
      const result = await this.connection.query(query, params);
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      return {
        testName,
        query,
        executionTime,
        rowsReturned: result.rowCount || 0,
        recommendations: this.generateRecommendations(executionTime, result.rowCount || 0)
      };
    } catch (error) {
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      return {
        testName,
        query,
        executionTime,
        rowsReturned: 0,
        recommendations: [`Query failed: ${error}`]
      };
    }
  }

  private generateRecommendations(executionTime: number, rowsReturned: number): string[] {
    const recommendations: string[] = [];

    if (executionTime > 1000) {
      recommendations.push('Query execution time is high (>1s). Consider optimization.');
    }

    if (executionTime > 100 && rowsReturned > 1000) {
      recommendations.push('Consider adding LIMIT clause or better filtering.');
    }

    if (executionTime > 500 && rowsReturned < 10) {
      recommendations.push('Consider adding or improving indexes for this query.');
    }

    return recommendations;
  }

  async generatePerformanceReport(): Promise<any> {
    const userQueryResults = await this.testUserQueries();
    const compositeIndexResults = await this.testCompositeIndexes();
    const indexEffectivenessResults = await this.testIndexEffectiveness();

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: userQueryResults.length + compositeIndexResults.length + indexEffectivenessResults.length,
        averageExecutionTime: this.calculateAverageExecutionTime([
          ...userQueryResults,
          ...compositeIndexResults,
          ...indexEffectivenessResults
        ]),
        slowQueries: this.getSlowQueries([
          ...userQueryResults,
          ...compositeIndexResults,
          ...indexEffectivenessResults
        ])
      },
      userQueries: userQueryResults,
      compositeIndexes: compositeIndexResults,
      indexEffectiveness: indexEffectivenessResults,
      recommendations: this.generateOverallRecommendations([
        ...userQueryResults,
        ...compositeIndexResults,
        ...indexEffectivenessResults
      ])
    };

    return report;
  }

  private calculateAverageExecutionTime(results: PerformanceTestResult[]): number {
    const totalTime = results.reduce((sum, result) => sum + result.executionTime, 0);
    return totalTime / results.length;
  }

  private getSlowQueries(results: PerformanceTestResult[]): PerformanceTestResult[] {
    return results.filter(result => result.executionTime > 500);
  }

  private generateOverallRecommendations(results: PerformanceTestResult[]): string[] {
    const recommendations: string[] = [];
    const slowQueries = this.getSlowQueries(results);

    if (slowQueries.length > 0) {
      recommendations.push(`${slowQueries.length} queries are performing slowly (>500ms)`);
      slowQueries.forEach(query => {
        recommendations.push(`  - ${query.testName}: ${query.executionTime.toFixed(2)}ms`);
      });
    }

    const avgTime = this.calculateAverageExecutionTime(results);
    if (avgTime > 200) {
      recommendations.push(`Overall average query time is high (${avgTime.toFixed(2)}ms)`);
    }

    return recommendations;
  }
}

// Performance testing utilities
export const PERFORMANCE_TEST_QUERIES = {
  // Test index usage with EXPLAIN
  explainQuery: (query: string) => `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,

  // Test sequential scan vs index scan
  testIndexScan: (table: string, column: string, value: string) => 
    `EXPLAIN (ANALYZE) SELECT * FROM "${table}" WHERE ${column} = '${value}'`,

  // Test composite index effectiveness
  testCompositeIndex: (table: string, columns: string[], values: string[]) => {
    const conditions = columns.map((col, i) => `${col} = '${values[i]}'`).join(' AND ');
    return `EXPLAIN (ANALYZE) SELECT * FROM "${table}" WHERE ${conditions}`;
  },

  // Test ordering performance
  testOrdering: (table: string, columns: string[], orderBy: string) => 
    `EXPLAIN (ANALYZE) SELECT ${columns.join(', ')} FROM "${table}" ORDER BY ${orderBy}`,

  // Test join performance
  testJoin: (table1: string, table2: string, joinCondition: string, whereCondition: string) => 
    `EXPLAIN (ANALYZE) SELECT * FROM "${table1}" JOIN "${table2}" ON ${joinCondition} WHERE ${whereCondition}`
};
