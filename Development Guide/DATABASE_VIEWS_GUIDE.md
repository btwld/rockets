# Database Views for Complex Queries Guide

> **For AI Tools**: This guide contains database view patterns for complex queries and aggregations. Use this when implementing database views for frequently accessed complex data.

## 📋 **Quick Reference**

| Task | Section |
|------|---------|
| Create database views | [Creating Views](#creating-views) |
| Complex aggregations | [Aggregation Views](#aggregation-views) |
| Performance optimization | [View Optimization](#view-optimization) |
| Use views in services | [Service Integration](#service-integration) |

---

## Creating Views

### When to Use Database Views

Database views are beneficial for:
- **Complex aggregations** accessed frequently
- **Simplified queries** by pre-joining tables  
- **Performance optimization** for expensive computations
- **Consistent business logic** across the application
- **Security** by hiding sensitive columns

### TypeORM View Entity

```typescript
// song-statistics.view.ts
import { ViewEntity, ViewColumn } from 'typeorm';

@ViewEntity({
  name: 'song_statistics',
  expression: `
    SELECT 
      s.id,
      s.title,
      s.artist_id,
      a.name as artist_name,
      s.album_id,
      al.title as album_title,
      s.release_date,
      s.duration,
      s.status,
      COUNT(DISTINCT pl.id) as playlist_count,
      COUNT(DISTINCT g.id) as genre_count,
      COALESCE(AVG(r.rating), 0) as avg_rating,
      COUNT(DISTINCT r.id) as rating_count
    FROM song s
    LEFT JOIN artist a ON s.artist_id = a.id
    LEFT JOIN album al ON s.album_id = al.id
    LEFT JOIN playlist_song ps ON s.id = ps.song_id
    LEFT JOIN playlist pl ON ps.playlist_id = pl.id
    LEFT JOIN song_genre sg ON s.id = sg.song_id
    LEFT JOIN genre g ON sg.genre_id = g.id
    LEFT JOIN song_rating r ON s.id = r.song_id
    GROUP BY 
      s.id, s.title, s.artist_id, a.name, s.album_id, 
      al.title, s.release_date, s.duration, s.status
  `,
})
export class SongStatisticsView {
  @ViewColumn()
  id!: string;

  @ViewColumn()
  title!: string;

  @ViewColumn()
  artist_id!: string;

  @ViewColumn()
  artist_name!: string;

  @ViewColumn()
  album_id?: string;

  @ViewColumn()
  album_title?: string;

  @ViewColumn()
  release_date?: Date;

  @ViewColumn()
  duration?: number;

  @ViewColumn()
  status!: string;

  @ViewColumn()
  playlist_count!: number;

  @ViewColumn()
  genre_count!: number;

  @ViewColumn()
  avg_rating!: number;

  @ViewColumn()
  rating_count!: number;
}
```

### Artist Summary View

```typescript
// artist-summary.view.ts
@ViewEntity({
  name: 'artist_summary',
  expression: `
    SELECT 
      a.id,
      a.name,
      a.status,
      COUNT(DISTINCT s.id) as song_count,
      COUNT(DISTINCT al.id) as album_count,
      SUM(s.duration) as total_duration,
      MIN(s.release_date) as first_release,
      MAX(s.release_date) as latest_release,
      COALESCE(AVG(r.rating), 0) as avg_rating
    FROM artist a
    LEFT JOIN song s ON a.id = s.artist_id
    LEFT JOIN album al ON a.id = al.artist_id
    LEFT JOIN song_rating r ON s.id = r.song_id
    GROUP BY a.id, a.name, a.status
  `,
})
export class ArtistSummaryView {
  @ViewColumn()
  id!: string;

  @ViewColumn()
  name!: string;

  @ViewColumn()
  status!: string;

  @ViewColumn()
  song_count!: number;

  @ViewColumn()
  album_count!: number;

  @ViewColumn()
  total_duration!: number;

  @ViewColumn()
  first_release?: Date;

  @ViewColumn()
  latest_release?: Date;

  @ViewColumn()
  avg_rating!: number;
}
```

---

## Service Integration

### Using Views in Services

```typescript
// analytics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SongStatisticsView } from './song-statistics.view';
import { ArtistSummaryView } from './artist-summary.view';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(SongStatisticsView)
    private readonly songStatsRepository: Repository<SongStatisticsView>,
    @InjectRepository(ArtistSummaryView)
    private readonly artistSummaryRepository: Repository<ArtistSummaryView>,
  ) {}

  /**
   * Get top songs by popularity
   */
  async getTopSongs(limit: number = 10): Promise<SongStatisticsView[]> {
    return await this.songStatsRepository.find({
      order: { 
        playlist_count: 'DESC', 
        avg_rating: 'DESC',
        rating_count: 'DESC'
      },
      take: limit,
    });
  }

  /**
   * Get artist performance metrics
   */
  async getArtistMetrics(artistId: string): Promise<{
    summary: ArtistSummaryView;
    topSongs: SongStatisticsView[];
    recentActivity: any[];
  } | null> {
    const summary = await this.artistSummaryRepository.findOne({
      where: { id: artistId } as any,
    });

    if (!summary) {
      return null;
    }

    const topSongs = await this.songStatsRepository.find({
      where: { artist_id: artistId },
      order: { playlist_count: 'DESC', avg_rating: 'DESC' },
      take: 5,
    });

    // Get recent activity from the last 30 days
    const recentActivity = await this.songStatsRepository.query(`
      SELECT 
        title,
        release_date,
        playlist_count,
        avg_rating
      FROM song_statistics 
      WHERE artist_id = $1 
        AND release_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY release_date DESC
    `, [artistId]);

    return {
      summary,
      topSongs,
      recentActivity,
    };
  }

  /**
   * Dashboard statistics
   */
  async getDashboardStats(): Promise<{
    totalStats: any;
    topArtists: ArtistSummaryView[];
    trendingGenres: any[];
  }> {
    // Overall statistics
    const totalStats = await this.artistSummaryRepository.query(`
      SELECT 
        COUNT(DISTINCT id) as total_artists,
        SUM(song_count) as total_songs,
        SUM(album_count) as total_albums,
        SUM(total_duration) as total_duration,
        AVG(avg_rating) as overall_avg_rating
      FROM artist_summary
    `);

    // Top performing artists
    const topArtists = await this.artistSummaryRepository.find({
      order: { 
        song_count: 'DESC',
        avg_rating: 'DESC' 
      },
      take: 10,
    });

    // Trending genres (using the view)
    const trendingGenres = await this.songStatsRepository.query(`
      SELECT 
        g.name as genre_name,
        COUNT(ss.id) as song_count,
        AVG(ss.avg_rating) as avg_rating,
        SUM(ss.playlist_count) as total_playlist_appearances
      FROM song_statistics ss
      JOIN song_genre sg ON ss.id = sg.song_id
      JOIN genre g ON sg.genre_id = g.id
      WHERE ss.release_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY g.name
      ORDER BY total_playlist_appearances DESC, avg_rating DESC
      LIMIT 10
    `);

    return {
      totalStats: totalStats[0],
      topArtists,
      trendingGenres,
    };
  }
}
```

---

## Aggregation Views

### Genre Popularity View

```typescript
// genre-popularity.view.ts
@ViewEntity({
  name: 'genre_popularity',
  expression: `
    SELECT 
      g.id,
      g.name,
      g.status,
      COUNT(DISTINCT s.id) as song_count,
      COUNT(DISTINCT s.artist_id) as artist_count,
      SUM(s.duration) as total_duration,
      AVG(sr.rating) as avg_rating,
      COUNT(DISTINCT ps.playlist_id) as playlist_appearances
    FROM genre g
    LEFT JOIN song_genre sg ON g.id = sg.genre_id
    LEFT JOIN song s ON sg.song_id = s.id
    LEFT JOIN song_rating sr ON s.id = sr.song_id
    LEFT JOIN playlist_song ps ON s.id = ps.song_id
    GROUP BY g.id, g.name, g.status
  `,
})
export class GenrePopularityView {
  @ViewColumn()
  id!: string;

  @ViewColumn()
  name!: string;

  @ViewColumn()
  status!: string;

  @ViewColumn()
  song_count!: number;

  @ViewColumn()
  artist_count!: number;

  @ViewColumn()
  total_duration!: number;

  @ViewColumn()
  avg_rating!: number;

  @ViewColumn()
  playlist_appearances!: number;
}
```

### Monthly Statistics View

```typescript
// monthly-stats.view.ts
@ViewEntity({
  name: 'monthly_stats',
  expression: `
    SELECT 
      DATE_TRUNC('month', s.release_date) as month,
      COUNT(DISTINCT s.id) as songs_released,
      COUNT(DISTINCT s.artist_id) as active_artists,
      COUNT(DISTINCT al.id) as albums_released,
      SUM(s.duration) as total_duration,
      AVG(sr.rating) as avg_rating
    FROM song s
    LEFT JOIN album al ON s.album_id = al.id
    LEFT JOIN song_rating sr ON s.id = sr.song_id
    WHERE s.release_date IS NOT NULL
    GROUP BY DATE_TRUNC('month', s.release_date)
    ORDER BY month DESC
  `,
})
export class MonthlyStatsView {
  @ViewColumn()
  month!: Date;

  @ViewColumn()
  songs_released!: number;

  @ViewColumn()
  active_artists!: number;

  @ViewColumn()
  albums_released!: number;

  @ViewColumn()
  total_duration!: number;

  @ViewColumn()
  avg_rating!: number;
}
```

---

## View Optimization

### Performance Considerations

```typescript
// Materialized view for heavy computations (PostgreSQL)
@ViewEntity({
  name: 'heavy_analytics',
  materialized: true, // Creates materialized view
  expression: `
    SELECT 
      s.id,
      s.title,
      -- Complex calculations here
      (
        SELECT COUNT(*) * 1.5 + AVG(rating) * 2.0 + 
               LOG(EXTRACT(EPOCH FROM NOW() - s.release_date) / 86400)
        FROM song_rating sr 
        WHERE sr.song_id = s.id
      ) as popularity_score,
      -- Other expensive computations
    FROM song s
    WHERE s.status = 'AVAILABLE_FOR_SALE'
  `,
})
export class HeavyAnalyticsView {
  @ViewColumn()
  id!: string;

  @ViewColumn()
  title!: string;

  @ViewColumn()
  popularity_score!: number;
}
```

### Refresh Materialized Views

```typescript
// service to refresh materialized views
@Injectable()
export class ViewMaintenanceService {
  constructor(
    @InjectRepository(HeavyAnalyticsView)
    private readonly heavyAnalyticsRepository: Repository<HeavyAnalyticsView>,
  ) {}

  async refreshMaterializedViews(): Promise<void> {
    // Refresh materialized views (PostgreSQL specific)
    await this.heavyAnalyticsRepository.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY heavy_analytics'
    );
  }

  async setupViewRefreshSchedule(): Promise<void> {
    // This would typically be called from a cron job or scheduled task
    setInterval(async () => {
      try {
        await this.refreshMaterializedViews();
        console.log('Materialized views refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh materialized views:', error);
      }
    }, 60 * 60 * 1000); // Refresh every hour
  }
}
```

---

## Module Configuration

### Registering Views

```typescript
// analytics.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SongStatisticsView } from './song-statistics.view';
import { ArtistSummaryView } from './artist-summary.view';
import { GenrePopularityView } from './genre-popularity.view';
import { MonthlyStatsView } from './monthly-stats.view';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SongStatisticsView,
      ArtistSummaryView,
      GenrePopularityView,
      MonthlyStatsView,
    ]),
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
```

### Controller Implementation

```typescript
// analytics.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboard() {
    return await this.analyticsService.getDashboardStats();
  }

  @Get('artists/top')
  @ApiOperation({ summary: 'Get top performing artists' })
  async getTopArtists(@Query('limit') limit: string = '10') {
    return await this.analyticsService.getTopArtists(parseInt(limit));
  }

  @Get('songs/top')
  @ApiOperation({ summary: 'Get top songs by popularity' })
  async getTopSongs(@Query('limit') limit: string = '10') {
    return await this.analyticsService.getTopSongs(parseInt(limit));
  }

  @Get('artists/:id/metrics')
  @ApiOperation({ summary: 'Get artist performance metrics' })
  async getArtistMetrics(@Param('id') artistId: string) {
    return await this.analyticsService.getArtistMetrics(artistId);
  }
}
```

---

## Best Practices

### ✅ Do:

- **Use views for frequently accessed complex queries**
- **Create materialized views for expensive computations**
- **Index underlying tables properly** for view performance
- **Refresh materialized views regularly** via scheduled jobs
- **Document view logic** clearly in comments
- **Use appropriate column names** in views for clarity

### Best Practices:

- **Use views appropriately**: Create views for complex multi-table queries, not simple single-table operations
- **Register views properly**: Always register database views in TypeORM modules for proper integration
- **Respect view limitations**: Remember that views are read-only and cannot be used for write operations
- **Keep views maintainable**: Create views that are complex enough to be useful but simple enough to maintain
- **Handle refresh gracefully**: Implement proper error handling and retry logic for materialized view refresh operations

Database views provide an excellent way to encapsulate complex business logic at the database level while maintaining clean, performant application code.