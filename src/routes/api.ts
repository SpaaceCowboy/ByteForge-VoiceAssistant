import { Router, Request, Response, NextFunction } from 'express';
import { customerModel, callLogModel, faqModel, reservationModel } from '../models';
import { getCurrentDate, formatDate } from '../utils/helpers';
import logger from '../utils/logger';
import type { ApiResponse, PaginatedResponse } from '../../types/index';

const router = Router()

//error handler wraper
function asyncHandler(
    fn: (req: Request, res:Response, next: NextFunction) => Promise<void> 
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}

//health check
router.get('/health', (req:Request, res:Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    })
})

//reservations
router.get('/reservations', asyncHandler(async (req: Request, res: Response) => {
    const { date, status, limit = '50', offset = '0'} = req.query;

    let reservations;
    
    if (date && typeof date === 'string') {
        reservations = await reservationModel.findByDate(date);
    } else {
        reservations = await reservationModel.findByDate(getCurrentDate());
    }

    const response: PaginatedResponse<typeof reservations[0]> = {
        success: true,
        data: reservations,
        count: reservations.length
    };

    res.json(response)
}))

// get a specific reservation
router.get('/reservations/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const reservation = await reservationModel.findById(id);

    if (!reservation) {
        res.status(404).json({
            success: false,
            error: 'Reservation not found'
        })
        return;
    }

    res.json({
        success: true,
        data: reservation,
    })
}))

router.patch('/reservations/:id', asyncHandler(async (req: Request, res:Response) => {
    const id = parseInt(req.params.id);
    const updates = req.body;
    
    const reservation = await reservationModel.modify(id, {
        date: updates.date,
        time: updates.time,
        partySize: updates.partySize,
        specialRequests: updates.specialRequests,
        status: updates.status,
        tableNumber: updates.tableNumber
    })

    if (!reservation) {
        res.status(404).json({
            success: false,
            error: 'Reservation not found'
        })
        return;
    }

    res.json({
        success: true,
        data: reservation,
    })
}))

// cancle reservation
router.delete('/reservations/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const reservation = await reservationModel.cancel(id, reason);

    if (!reservation) {
        res.status(404).json({
            success: false,
            error: 'reservation not found'
        })
        return;
    }
    res.json({
        success: true,
        data: reservation,
    })
}))

//search customer by name or phone
router.get('/customers/search', asyncHandler(async (req: Request, res: Response) => {
    const {q, limit = '20'} = req.query;

    if (!q || typeof q !== 'string') {
        res.status(400).json({
            success: false,
            error: 'search query required',
        })
        return;
    }

    const customers = await customerModel.search(q, parseInt(limit as string))

    res.json({
        success: true,
        data: customers,
        count: customers.length,
    })
}))

//get customer with history 
router.get('/customers/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const customer = await customerModel.findById(id)

    if (!customer) {
        res.status(404).json({
            success: false,
            error: 'Customer not found'
        })
        return;
    }

    const customerWithHistory = await customerModel.getCustomerWithHistory(customer.phone);

    res.json({
        success: true,
        data: customerWithHistory
    })
}))

//CALL LOGS

//get recent call logs
router.get('/calls', asyncHandler(async (req: Request, res:Response) => {
    const { start_date, end_date, transferred, limit = '50'} = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(7);
    const endDate = (end_date as string) || getCurrentDate();

    let calls;

    if (transferred === 'true') {
        calls = await callLogModel.findTransferredCalls(startDate, endDate);
    } else {
        calls = await callLogModel.findRecent(startDate, endDate, parseInt(limit as string));
    }

    res.json({
        success: true,
        data: calls,
        count: calls.length
    })
}))

// get a specific call log
router.get('/calls/:callSid', asyncHandler(async (req: Request, res: Response) => {
    const callSid = req.params.callSid;
    const call = await callLogModel.findByCallSid(callSid);

    if (!call) {
        res.status(404).json({
            success: false,
            error: 'Call not found',
        })
        return;
    }

    res.json({
        success: true,
        data: call,
    })
}))

//ANALYTICS

//get overcuew statistics
router.get('/analytics/overview', asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date} = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(30);
    const endDate = (end_date as string) || getCurrentDate();

    const [callStats, reservationStats] = await Promise.all([
        callLogModel.getStats(startDate, endDate),
        reservationModel.getStats(startDate, endDate),
    ])

    res.json({
        success: true,
        data: {
            period: { start: startDate, end: endDate},
            calls: callStats,
            reservations: reservationStats,
        },
    })
}))

//Get intent breakdown
router.get('/analytics/intents', asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date} = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(30);
    const endDate = (end_date as string) || getCurrentDate();

    const intents = await callLogModel.getIntentBreakdown(startDate, endDate);

    res.json({
        success: true,
        data: intents,
    });
}))

// get hourly call distribution

router.get('/analytics/hourly', asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date} = req.query;

    const startDate = (start_date as string) || getDateDaysAgo(7);
    const endDate = (end_date as string) || getCurrentDate();

    const hourly = await callLogModel.getHourlyDistribution(startDate, endDate);

    res.json({
        success: true,
        data: hourly,
    })
}))

//FAQs

//get all faqs
router.get('/faqs', asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.query;

    let faqs;

    if (category && typeof category === 'string') {
        faqs = await faqModel.findByCategory(category);
    } else {
        faqs = await faqModel.findAll();
    }

    res.json({
        success: true,
        data: faqs,
        count: faqs.length
    })
}))

//get FAQ categories
router.get('/faqs/categories', asyncHandler(async (req: Request, res: Response) => {
    const categories = await faqModel.getCategories();

    res.json({
        success: true,
        data: categories,
    })
}))

// create a new FAQ
router.post('/faqs', asyncHandler(async (req: Request, res: Response) => {
    const { questionPattern, questionVariations, answer, answerShort, category, priority } = req.body;
    
    if (!questionPattern || !answer || !category) {
      res.status(400).json({
        success: false,
        error: 'questionPattern, answer, and category are required',
      });
      return;
    }
    
    const faq = await faqModel.create({
      questionPattern,
      questionVariations,
      answer,
      answerShort,
      category,
      priority,
    });
    
    res.status(201).json({
      success: true,
      data: faq,
    });
  }));

  //update a faq
  router.patch('/faqs/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const updates = req.body;

    const faq = await faqModel.update(id, {
        question_pattern: updates.questionPattern,
        question_variations: updates.questionVariations,
        answer: updates.answer,
        answer_short: updates.answerShort,
        category: updates.category,
        priority: updates.priority,
        is_active: updates.isActive
    })

    if (!faq) {
        res.status(404).json({
            success: false,
            error: 'FAQ not found',
        })
        return
    }
    
    res.json({
        success: true,
        data: faq,
    })
    
  }))

  //delete a faq
  router.delete('/faqs/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);

    await faqModel.deactivate(id);

    res.json({
        success: true,
        message: 'FAQ deactivated'
    })
  }))

  //helper function

  function getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDate(date);
  }

  // error handler
  router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('API error', err)

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
    })
  })

  export default router
  
