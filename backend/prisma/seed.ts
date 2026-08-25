import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create demo organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Organization',
      slug: 'demo-org',
      plan: 'PROFESSIONAL',
    },
  });

  // Create demo user
  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'demo@engagement-platform.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'User',
      role: 'OWNER',
    },
  });

  // Create demo sites
  const twitterSite = await prisma.site.create({
    data: {
      organizationId: org.id,
      name: 'Twitter Account',
      url: 'https://api.twitter.com',
      platform: 'TWITTER',
      description: 'Main Twitter account for engagement',
    },
  });

  const redditSite = await prisma.site.create({
    data: {
      organizationId: org.id,
      name: 'Reddit Account',
      url: 'https://www.reddit.com',
      platform: 'REDDIT',
      description: 'Reddit engagement automation',
    },
  });

  const wordpressSite = await prisma.site.create({
    data: {
      organizationId: org.id,
      name: 'Company Blog',
      url: 'https://blog.example.com',
      platform: 'WORDPRESS',
      description: 'WordPress blog for content engagement',
    },
  });

  // Create demo engagements
  await prisma.engagement.create({
    data: {
      siteId: twitterSite.id,
      name: 'Like trending tech tweets',
      engagementType: 'LIKE',
      targetConfig: { hashtags: ['#tech', '#programming', '#ai'] },
      frequency: {
        maxPerMinute: 1,
        maxPerHour: 15,
        maxPerDay: 200,
        maxPerWeek: 1000,
        cooldownMs: 60000,
        jitterMs: 5000,
        backoffStrategy: 'LINEAR',
      },
      status: 'ACTIVE',
      priority: 5,
    },
  });

  await prisma.engagement.create({
    data: {
      siteId: twitterSite.id,
      name: 'Follow tech influencers',
      engagementType: 'FOLLOW_USER',
      targetConfig: { userList: ['@elonmusk', '@sama', '@kaborez'] },
      frequency: {
        maxPerMinute: 1,
        maxPerHour: 5,
        maxPerDay: 50,
        cooldownMs: 120000,
        jitterMs: 10000,
        backoffStrategy: 'EXPONENTIAL',
      },
      status: 'ACTIVE',
      priority: 3,
    },
  });

  await prisma.engagement.create({
    data: {
      siteId: redditSite.id,
      name: 'Upvote programming posts',
      engagementType: 'UPVOTE',
      targetConfig: { subreddits: ['r/programming', 'r/webdev', 'r/typescript'] },
      frequency: {
        maxPerMinute: 1,
        maxPerHour: 10,
        maxPerDay: 100,
        cooldownMs: 90000,
        jitterMs: 8000,
        backoffStrategy: 'LINEAR',
      },
      status: 'ACTIVE',
      priority: 4,
    },
  });

  await prisma.engagement.create({
    data: {
      siteId: wordpressSite.id,
      name: 'Comment on blog posts',
      engagementType: 'CREATE_COMMENT',
      targetConfig: { postUrls: ['https://blog.example.com/latest-post'] },
      config: { commentTemplate: 'Great article! Thanks for sharing.' },
      frequency: {
        maxPerMinute: 1,
        maxPerHour: 3,
        maxPerDay: 20,
        cooldownMs: 300000,
        jitterMs: 30000,
        backoffStrategy: 'LINEAR',
      },
      status: 'DRAFT',
      priority: 2,
    },
  });

  console.log('Seed completed!');
  console.log(`Demo login: demo@engagement-platform.com / Demo123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
