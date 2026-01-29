/**
 * PATCH_41: Real Baseline Blog Seeding
 *
 * This script seeds production-safe, evergreen educational blog posts.
 * Run once: node scripts/seed-real-blogs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Blog = require("../src/models/Blog");

const REAL_BLOGS = [
  {
    title: "How Microjob Platforms Work & How to Get Started",
    slug: "how-microjob-platforms-work-getting-started",
    excerpt:
      "A comprehensive guide to understanding microjob platforms, how they operate, and the steps you need to take to start earning money online.",
    category: "microjobs",
    status: "published",
    content: `
## Introduction to Microjob Platforms

Microjob platforms have revolutionized the way people earn money online. These platforms connect workers with businesses and organizations that need small, discrete tasks completed. From data labeling for artificial intelligence to simple survey responses, microjobs offer flexible earning opportunities for people worldwide.

## How Microjob Platforms Operate

At their core, microjob platforms act as intermediaries between task requesters and workers. Here's the typical workflow:

### 1. Task Creation
Companies or researchers create tasks that need human input. These might include:
- Labeling images for machine learning datasets
- Transcribing audio recordings
- Categorizing products or content
- Completing surveys and providing feedback
- Verifying information accuracy

### 2. Task Distribution
The platform distributes tasks to qualified workers based on their skills, location, and availability. Some tasks require specific qualifications or certifications, while others are open to anyone who meets basic requirements.

### 3. Quality Control
Most platforms implement quality control measures:
- Test questions with known answers mixed into real tasks
- Review of completed work by other workers or supervisors
- Performance metrics that track accuracy over time
- Reputation systems that unlock higher-paying tasks

### 4. Payment Processing
Workers receive payment through various methods:
- Direct bank transfer
- Digital wallets (PayPal, Payoneer, etc.)
- Cryptocurrency
- Platform-specific payment systems

## Getting Started: Step-by-Step

### Step 1: Choose Your Platforms
Research platforms that match your skills and location. Popular options include data labeling platforms, survey sites, and AI training platforms. Each has different requirements, pay rates, and task availability.

### Step 2: Create Your Account
Registration typically requires:
- Valid email address
- Basic personal information
- Proof of identity (government ID)
- Payment method setup

### Step 3: Complete Verification
Most reputable platforms require identity verification (KYC - Know Your Customer). This protects both the platform and workers from fraud. Have ready:
- Government-issued ID
- Proof of address
- Selfie for facial verification

### Step 4: Take Qualification Tests
Many platforms offer qualification tests that unlock specific task types. These tests:
- Demonstrate your understanding of task guidelines
- Show your attention to detail
- Give you access to higher-paying work

### Step 5: Start with Training Tasks
Begin with training or onboarding tasks to learn the platform interface and task requirements. These often have lower pay but help you build accuracy and speed.

## Tips for Success

### Maintain High Accuracy
Quality matters more than speed initially. Focus on understanding guidelines thoroughly before rushing through tasks.

### Be Consistent
Regular activity helps maintain access to tasks. Platforms often prioritize active workers.

### Diversify Your Platforms
Don't rely on a single platform. Different platforms have varying task availability, so working on multiple sites increases earning potential.

### Track Your Performance
Monitor your accuracy scores and feedback. Address any issues promptly to maintain your standing.

## Common Challenges and Solutions

### Challenge: Low Task Availability
Solution: Work during peak hours (usually business hours in the US), try multiple platforms, and complete qualifications for more task types.

### Challenge: Account Verification Issues
Solution: Ensure all documents are clear, current, and match your profile information exactly. Seek professional assistance if needed.

### Challenge: Payment Delays
Solution: Understand each platform's payment schedule and minimum thresholds before starting.

## Conclusion

Microjob platforms offer legitimate opportunities to earn money online, but success requires patience, attention to detail, and consistent effort. Start with proper account setup and verification, focus on quality work, and gradually expand to multiple platforms for steady income potential.
    `.trim(),
  },
  {
    title: "Step-by-Step Guide to Passing KYC for Online Work Platforms",
    slug: "step-by-step-guide-passing-kyc-online-work-platforms",
    excerpt:
      "Learn exactly how to complete KYC (Know Your Customer) verification successfully for online work platforms, exchanges, and payment services.",
    category: "guides",
    status: "published",
    content: `
## What is KYC and Why Does It Matter?

KYC stands for "Know Your Customer" - a verification process that platforms use to confirm your identity. This process is legally required for financial services and increasingly common for work platforms, exchanges, and payment processors.

### Why Platforms Require KYC
- Regulatory compliance with anti-money laundering laws
- Prevention of fraud and identity theft
- Protection of both users and the platform
- Access to higher transaction limits
- Eligibility for certain services and tasks

## Documents You'll Need

Before starting any KYC process, gather these documents:

### Primary Identification
- Passport (preferred for international platforms)
- National ID card
- Driver's license

### Proof of Address (Recent - within 3 months)
- Utility bill (electricity, water, gas)
- Bank statement
- Government correspondence
- Rental agreement or lease

### Additional Requirements (Platform-Specific)
- Tax identification number
- Social security number (US platforms)
- Selfie holding your ID
- Video verification

## Step-by-Step KYC Process

### Step 1: Prepare Your Documents
Before uploading anything:
- Ensure documents are not expired
- Check that all text is clearly readable
- Verify names match exactly across documents
- Have digital copies ready (scanned or photographed)

### Step 2: Take Quality Photos
For document photos:
- Use good lighting (natural light works best)
- Place document on a flat, contrasting surface
- Capture all four corners in the frame
- Avoid glare, shadows, or blurring
- Ensure all text is legible

### Step 3: Submit Primary ID
- Upload front and back of your ID
- Double-check that the image is clear
- Verify the upload was successful
- Note any file size or format requirements

### Step 4: Submit Proof of Address
- Upload a recent document showing your full address
- Ensure the date is visible
- Verify your name and address match your ID
- Some platforms accept digital statements

### Step 5: Complete Selfie Verification
If required:
- Use a well-lit area
- Look directly at the camera
- Follow any specific instructions (smile, hold up fingers, etc.)
- Some platforms use video verification instead

### Step 6: Wait for Review
- Most platforms complete verification in 24-48 hours
- Complex cases may take longer
- You'll receive email notification of results
- Check spam folder for communications

## Common Reasons for Rejection

### Document Issues
- Expired documents
- Poor image quality
- Incorrect file format
- Documents in unsupported languages

### Information Mismatches
- Name spelling differences between documents
- Address not matching
- Date of birth discrepancies

### Technical Problems
- File too large or too small
- Wrong file type uploaded
- Incomplete uploads
- Browser compatibility issues

## How to Fix Rejection Issues

### If Documents Were Rejected
1. Read the rejection reason carefully
2. Obtain new or updated documents if needed
3. Retake photos with better quality
4. Resubmit following guidelines exactly

### If Information Doesn't Match
1. Update your profile information
2. Use documents with consistent information
3. Contact support if legal name changes are involved
4. Provide supporting documentation if available

## Tips for First-Time Success

### Before You Start
- Read all platform-specific requirements
- Have all documents ready before beginning
- Use a stable internet connection
- Set aside 15-30 minutes without interruption

### During Submission
- Follow instructions exactly
- Double-check each upload before submitting
- Keep copies of everything you submit
- Note any reference numbers provided

### After Submission
- Check email regularly (including spam)
- Don't submit multiple times unless requested
- Be patient with processing times
- Contact support only after stated timeframes

## Special Considerations

### International Users
- Passports are generally most widely accepted
- Some platforms have country restrictions
- Documents may need official translation
- Time zones affect processing times

### Privacy Concerns
- Use only reputable platforms
- Check platform security measures
- Understand data retention policies
- Know your rights regarding personal information

## Conclusion

Successful KYC verification requires preparation, attention to detail, and patience. By gathering the right documents, taking clear photos, and following platform instructions precisely, you can complete verification smoothly and gain full access to online platforms and services.
    `.trim(),
  },
  {
    title: "Fresh Profile vs Ready-to-Work Accounts: What's the Difference?",
    slug: "fresh-profile-vs-ready-to-work-accounts-difference",
    excerpt:
      "Understand the key differences between fresh profiles and ready-to-work accounts on online work platforms and what each status means for your earning potential.",
    category: "microjobs",
    status: "published",
    content: `
## Understanding Account Status on Work Platforms

When you join an online work platform, your account goes through various stages before you can start earning. Understanding these stages helps you navigate the onboarding process more effectively and set realistic expectations.

## What is a Fresh Profile?

A fresh profile is a newly created account that has not yet completed the verification and screening process. Think of it as your starting point on any platform.

### Characteristics of Fresh Profiles
- Recently registered account
- Basic information submitted
- Verification pending or not yet started
- Limited or no access to tasks
- No performance history
- Cannot receive payments yet

### What You Can Do with a Fresh Profile
- Complete your personal information
- Upload required documents
- Start the verification process
- Access platform tutorials and guides
- View available task categories

### Limitations of Fresh Profiles
- Cannot access paid tasks
- Cannot withdraw earnings
- May have restricted platform features
- Cannot participate in specialized projects
- Limited support options

## What is a Ready-to-Work Account?

A ready-to-work account has completed all necessary verification, passed required screenings, and is eligible to receive work assignments.

### Characteristics of Ready-to-Work Accounts
- Full verification completed
- All required tests passed
- Payment method verified
- Access to available tasks
- Performance tracking enabled
- Eligible for project assignments

### What You Can Do with a Ready-to-Work Account
- Accept and complete paid tasks
- Receive payments for completed work
- Access full platform features
- Participate in specialized projects
- Build reputation and unlock higher tiers

### Benefits of Ready-to-Work Status
- Immediate access to earning opportunities
- Higher task priority over fresh profiles
- Access to better-paying work
- Full customer support
- Eligibility for bonuses and incentives

## The Journey from Fresh to Ready-to-Work

### Stage 1: Account Creation
Create your account with accurate information. Use real details that match your identification documents.

### Stage 2: Identity Verification (KYC)
Submit required documents for verification. This typically includes government ID and proof of address.

### Stage 3: Skill Assessment
Complete any required tests or qualifications. These assessments verify your ability to perform tasks accurately.

### Stage 4: Platform Training
Complete onboarding modules or training tasks. These teach you platform-specific guidelines and procedures.

### Stage 5: Account Activation
Once all steps are complete, your account is activated for work. You'll receive notification of your ready-to-work status.

## Common Obstacles in the Transition

### Document Issues
- Expired identification
- Unclear document photos
- Information mismatches
- Missing required documents

### Assessment Challenges
- Failing qualification tests
- Incomplete training modules
- Low scores on initial evaluations
- Misunderstanding of guidelines

### Technical Problems
- Account suspension during review
- Payment method verification failures
- Platform technical difficulties
- Communication gaps

## How to Speed Up the Process

### Prepare Thoroughly
- Gather all documents before starting
- Ensure everything is current and valid
- Verify information consistency
- Have backup documents ready

### Focus on Quality
- Take clear, high-quality document photos
- Read all instructions carefully
- Don't rush through assessments
- Review answers before submitting

### Stay Engaged
- Check your email regularly
- Respond promptly to any requests
- Complete each step as soon as possible
- Follow up on pending verifications

### Seek Help When Needed
- Use platform support resources
- Ask questions if unsure
- Don't guess at requirements
- Consider professional verification assistance

## Why Account Status Matters

### For Earning Potential
Ready-to-work accounts can start earning immediately, while fresh profiles generate no income. The faster you transition, the sooner you earn.

### For Task Access
Many high-paying tasks are reserved for verified accounts. Fresh profiles miss these opportunities until they complete verification.

### For Platform Trust
Platforms prioritize ready-to-work accounts for the best tasks. Your verified status signals reliability and commitment.

### For Payment Security
Only fully verified accounts can receive payments. Completing verification protects your earnings.

## Maintaining Ready-to-Work Status

Once you achieve ready-to-work status, maintain it by:
- Keeping documents current
- Maintaining accuracy standards
- Following platform guidelines
- Staying active on the platform
- Updating information as needed

## Conclusion

The transition from fresh profile to ready-to-work status is essential for anyone wanting to earn on online work platforms. Understanding what each status means, preparing properly, and completing each step thoroughly will help you reach earning potential faster and maintain access to the best opportunities.
    `.trim(),
  },
  {
    title: "How UREMO Provides Manual Verification & Human Assistance",
    slug: "how-uremo-provides-manual-verification-human-assistance",
    excerpt:
      "Discover how UREMO's manual verification process works and why human assistance makes a difference in account setup and verification success.",
    category: "guides",
    status: "published",
    content: `
## The Challenge of Online Verification

Setting up accounts on online platforms can be frustrating. Automated systems reject applications for minor issues, support responses take days, and the verification process feels like a black box. Many people give up after repeated rejections without understanding what went wrong.

## UREMO's Human-First Approach

At UREMO, we believe technology should be supported by human expertise. Our manual verification process combines the efficiency of digital platforms with the understanding and problem-solving capabilities of trained professionals.

### What Manual Verification Means

Unlike fully automated systems, our verification process includes:
- Human review of all submitted documents
- Personal attention to each application
- Direct communication when issues arise
- Problem-solving for unusual situations
- Quality assurance before submission

### Why Human Assistance Matters

#### Understanding Context
Automated systems follow rigid rules. They cannot understand that a document is valid but formatted differently, or that a name variation is legitimate. Human reviewers can recognize these situations and handle them appropriately.

#### Solving Problems
When something goes wrong, automated systems generate generic error messages. Human assistance means identifying the actual issue and providing specific guidance to resolve it.

#### Reducing Stress
Verification can be stressful, especially when rejections seem arbitrary. Working with a real person who explains what's needed and why removes uncertainty from the process.

## How Our Process Works

### Step 1: Service Selection
Choose the verification service you need from our catalog. Each service page clearly explains:
- What's included
- Required documents
- Expected timeframe
- Pricing

### Step 2: Order Placement
Submit your order through our secure platform. Your dashboard tracks the order status from placement to completion.

### Step 3: Document Collection
Our team reviews your requirements and requests any necessary documents. We provide clear instructions on:
- What documents are needed
- How to capture them properly
- What information to include

### Step 4: Manual Verification
This is where human expertise makes the difference. Our team:
- Reviews all documents for accuracy and completeness
- Identifies potential issues before submission
- Formats information correctly for the target platform
- Handles the verification process on your behalf

### Step 5: Quality Assurance
Before marking any order complete, we verify:
- All requirements have been met
- The account or service is properly activated
- You have the information needed to proceed

### Step 6: Delivery
You receive:
- Confirmation of completed verification
- Any credentials or access information
- Documentation of what was completed
- Support for any follow-up questions

## Security and Privacy

We take document handling seriously:

### Secure Document Handling
- Encrypted transmission for all documents
- Limited access to sensitive information
- Documents used only for stated purposes
- Secure deletion after verification completion

### Privacy Protection
- No sharing of personal information
- Compliance with data protection standards
- Clear data retention policies
- User control over their information

### Trust Through Transparency
- Clear communication throughout the process
- Honest timeframe estimates
- Direct answers to questions
- No hidden fees or surprise charges

## When to Use Manual Verification Services

### Complex Verification Requirements
Some platforms have complicated or poorly documented requirements. Professional assistance navigates these complexities efficiently.

### Previous Rejections
If you've been rejected without clear explanation, human review can identify the issue and correct it.

### Time Constraints
When you need verification completed quickly, professional handling ensures no delays from avoidable errors.

### Language Barriers
If platform instructions are unclear or in an unfamiliar language, human assistance bridges the gap.

### High-Stakes Accounts
For accounts that are important to your income or business, professional verification reduces risk of problems.

## Results You Can Expect

### Higher Success Rates
Human review catches issues that cause automated rejections. Most verifications complete successfully on the first attempt.

### Faster Completion
Experienced handling means fewer back-and-forth cycles and quicker overall completion.

### Clear Communication
You always know what's happening with your order and what to expect next.

### Ongoing Support
If questions arise after completion, support is available to help.

## Our Commitment

UREMO exists to make verification and account setup accessible to everyone. We combine the convenience of online platforms with the reliability of human expertise. Every order receives individual attention, every customer gets clear communication, and every verification is handled with care.

Whether you're setting up your first online work account or need help with a complex verification, our team provides the human assistance that makes the difference between frustration and success.
    `.trim(),
  },
  {
    title: "Common Mistakes That Get Online Accounts Rejected",
    slug: "common-mistakes-get-online-accounts-rejected",
    excerpt:
      "Learn about the most frequent errors that cause account rejections on online platforms and how to avoid them for successful verification.",
    category: "guides",
    status: "published",
    content: `
## Why Account Rejections Happen

Account rejections are frustrating, especially when you don't understand what went wrong. Most rejections result from avoidable mistakes made during the application or verification process. Understanding these common errors helps you succeed on your first attempt.

## Document-Related Mistakes

### Using Expired Documents
One of the most common rejection reasons is submitting expired identification. Platforms require current, valid documents.

**Solution:**
- Check expiration dates before applying
- Renew documents well in advance
- Keep digital copies of current documents ready

### Poor Photo Quality
Blurry, dark, or partially visible documents cannot be verified.

**Common issues:**
- Glare from flash or lighting
- Shadows covering text
- Corners cut off in the image
- Text too small to read
- Background distracting from document

**Solution:**
- Use natural, diffused lighting
- Place document on flat, contrasting surface
- Ensure all four corners are visible
- Verify text is readable before submitting
- Retake if anything looks unclear

### Wrong Document Types
Submitting documents that don't meet platform requirements wastes time and causes rejection.

**Examples:**
- Submitting driver's license when passport is required
- Using bank statements that are too old
- Providing documents in unsupported formats

**Solution:**
- Read requirements carefully before starting
- When unsure, choose the most widely accepted option
- Check document date requirements

## Information Mismatch Errors

### Name Discrepancies
Your name must match exactly across all documents and your profile.

**Common issues:**
- Middle name on one document but not another
- Nickname vs legal name
- Maiden name vs married name
- Spelling variations

**Solution:**
- Use your full legal name consistently
- Ensure all documents show the same name
- Update profile if your name has changed

### Address Inconsistencies
Your address on proof of address must match your profile exactly.

**Common issues:**
- Different formatting (Street vs St., Apartment vs Apt.)
- Old address on documents
- Using a temporary or incorrect address

**Solution:**
- Update documents to reflect current address
- Match address format exactly to profile
- Use recent documents (within 3 months)

### Date of Birth Errors
Incorrect birth date entry causes automatic rejection.

**Solution:**
- Double-check date format requirements (DD/MM/YYYY vs MM/DD/YYYY)
- Verify against your ID before submitting
- Pay attention when entering information

## Technical Mistakes

### File Format Issues
Platforms accept specific file formats. Submitting the wrong type causes rejection.

**Common requirements:**
- JPEG or PNG for images
- PDF for documents
- Specific file size limits

**Solution:**
- Check format requirements before uploading
- Convert files if necessary
- Verify file uploaded correctly

### Incomplete Submissions
Submitting partial applications or missing required fields leads to rejection.

**Solution:**
- Complete all required fields
- Upload all requested documents
- Review submission before confirming
- Look for any error messages

### Multiple Submissions
Submitting multiple applications or making changes during review often causes problems.

**Solution:**
- Submit once and wait for response
- Don't create multiple accounts
- Contact support before resubmitting

## Account Behavior Issues

### Using VPN During Verification
Many platforms detect VPN usage and flag it as suspicious.

**Solution:**
- Disable VPN during verification
- Use your actual location
- Be consistent with your stated country

### Suspicious Account Activity
Starting verification immediately after account creation or during unusual hours can trigger fraud detection.

**Solution:**
- Let account "age" briefly before major actions
- Verify during normal hours for your timezone
- Complete profile naturally before verification

### Previous Account Issues
Having been banned or rejected previously on the same platform complicates new applications.

**Solution:**
- Address underlying issues first
- Be honest about account history if asked
- Consider professional assistance for complex cases

## Communication Mistakes

### Ignoring Platform Emails
Platforms often request additional information via email. Missing these requests causes rejection.

**Solution:**
- Check email daily during verification
- Monitor spam and promotions folders
- Respond promptly to requests

### Providing False Information
Attempting to use false information results in permanent bans.

**Solution:**
- Always use truthful, accurate information
- If you don't meet requirements, don't apply
- Honesty is the only sustainable approach

### Not Following Instructions
Every platform has specific procedures. Ignoring them causes problems.

**Solution:**
- Read all instructions completely
- Follow steps in the specified order
- Don't skip optional-seeming requirements

## Prevention Checklist

Before starting any verification:

### Documents
☐ All documents are current and valid
☐ Names match exactly across documents
☐ Address is current and consistent
☐ Photos are clear and complete
☐ Files are in correct format

### Information
☐ Profile information is accurate
☐ Name spelling is correct and consistent
☐ Date of birth is accurate
☐ Address matches documents exactly
☐ Contact information is valid

### Technical
☐ Stable internet connection
☐ VPN is disabled
☐ Browser is up to date
☐ All required fields will be completed
☐ Time available to finish completely

### Process
☐ Platform requirements are understood
☐ All required documents are gathered
☐ Email access is available for follow-up
☐ Patience for processing time
☐ Plan for addressing any issues

## What to Do After Rejection

If you're rejected:

1. Read the rejection reason carefully
2. Identify which mistake category applies
3. Correct the specific issue
4. Gather proper documentation
5. Wait for any required cooling-off period
6. Resubmit following all guidelines

If rejections continue or reasons are unclear, consider professional verification assistance to identify and resolve the underlying issues.

## Conclusion

Most account rejections are preventable. By understanding common mistakes and taking time to prepare properly, you can significantly increase your chances of first-time success. When in doubt, slow down, double-check everything, and don't hesitate to seek help for complex situations.
    `.trim(),
  },
];

async function seedBlogs() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not set in environment");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    console.log("\nSeeding real blog posts...\n");

    let created = 0;
    let skipped = 0;

    for (const blogData of REAL_BLOGS) {
      // Check if blog already exists by slug
      const existing = await Blog.findOne({ slug: blogData.slug });
      if (existing) {
        console.log(`⏭️  Skipped (exists): ${blogData.title}`);
        skipped++;
        continue;
      }

      await Blog.create(blogData);
      console.log(`✅ Created: ${blogData.title}`);
      created++;
    }

    console.log("\n========================================");
    console.log(`Blogs created: ${created}`);
    console.log(`Blogs skipped: ${skipped}`);
    console.log(`Total blogs in DB: ${await Blog.countDocuments()}`);
    console.log("========================================\n");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding blogs:", error);
    process.exit(1);
  }
}

seedBlogs();
