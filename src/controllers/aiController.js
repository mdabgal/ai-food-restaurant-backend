'use strict';

const { getDB } = require('../config/db');
const { generateStructuredContent, GeminiServiceError } = require('../services/geminiService');

const cleanString = (value, maxLength) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const sendAiError = (res, error) => {
  if (error instanceof GeminiServiceError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }

  console.error('[AI]', error.message);
  return res.status(500).json({
    success: false,
    message: 'Unable to complete the AI request. Please try again.',
  });
};

const generateFoodDescription = async (req, res) => {
  try {
    const name = cleanString(req.body.name, 100);
    const category = cleanString(req.body.category, 60);
    const price = Number(req.body.price);
    const ingredients = Array.isArray(req.body.ingredients)
      ? req.body.ingredients.map((item) => cleanString(item, 80)).filter(Boolean).slice(0, 30).join(', ')
      : cleanString(req.body.ingredients, 1000);

    const errors = [];
    if (name.length < 2) errors.push('Food name must contain at least 2 characters.');
    if (category.length < 2) errors.push('Category must contain at least 2 characters.');
    if (!Number.isFinite(price) || price < 0 || price > 10000) {
      errors.push('Price must be a number between 0 and 10000.');
    }
    if (errors.length) {
      return res.status(422).json({ success: false, message: 'Validation failed.', errors });
    }

    const prompt = `
ROLE
You are the senior menu copywriter for a modern premium restaurant.

TASK
Write one polished, marketing-friendly food description between 120 and 180 words.

VERIFIED FOOD INPUT
${JSON.stringify({ name, category, price, ingredients: ingredients || 'Not provided' }, null, 2)}

RULES
- Use only facts present in the verified input.
- Do not invent ingredients, preparation methods, dietary labels, awards, nutrition claims, or health benefits.
- If ingredients are not provided, focus on the dish name, category, dining experience, presentation, and value without inventing specifics.
- Keep the tone professional, appetizing, natural, and suitable for a restaurant menu.
- Do not use headings, bullet points, markdown, quotation marks, or calls to action.
- Return JSON matching the provided schema.
`.trim();

    const result = await generateStructuredContent({
      prompt,
      maxOutputTokens: 500,
      responseJsonSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'A single professional food description of approximately 120 to 180 words.',
          },
        },
        required: ['description'],
        additionalProperties: false,
      },
    });

    const description = cleanString(result.description, 2500);
    if (!description) {
      throw new GeminiServiceError('The AI service did not generate a usable description.', 502, 'INVALID_AI_RESPONSE');
    }

    return res.status(200).json({
      success: true,
      message: 'Description generated successfully.',
      data: { description },
    });
  } catch (error) {
    return sendAiError(res, error);
  }
};

const recommendFoods = async (req, res) => {
  try {
    const request = cleanString(req.body.request, 500);
    if (request.length < 3) {
      return res.status(422).json({
        success: false,
        message: 'Please enter a recommendation request of at least 3 characters.',
      });
    }

    const foods = await getDB().collection('foods')
      .find({
        $or: [
          { status: { $exists: false } },
          { status: { $in: ['available', 'limited'] } },
        ],
      })
      .project({
        name: 1,
        category: 1,
        price: 1,
        rating: 1,
        description: 1,
        image: 1,
        status: 1,
        ingredients: 1,
        macros: 1,
      })
      .sort({ rating: -1, _id: 1 })
      .limit(50)
      .toArray();

    if (!foods.length) {
      return res.status(404).json({
        success: false,
        message: 'No available foods were found in the catalog.',
      });
    }

    const catalog = foods.map((food) => ({
      foodId: String(food._id),
      name: food.name,
      category: food.category,
      price: food.price,
      rating: food.rating,
      description: cleanString(food.description, 600),
      ingredients: food.ingredients || null,
      macros: food.macros || null,
    }));

    const prompt = `
ROLE
You are a restaurant recommendation assistant. Match the guest's request only against the verified catalog below.

GUEST REQUEST
${JSON.stringify(request)}

VERIFIED AVAILABLE CATALOG
${JSON.stringify(catalog, null, 2)}

RULES
- Recommend between 1 and 5 foods, but only when they genuinely match the request.
- Copy foodId and name exactly from the verified catalog.
- Never invent a food, ingredient, price, nutrition value, category, or dietary property.
- Treat missing ingredients or macros as unknown; never infer vegetarian, high-protein, allergen, or health claims from missing data.
- Explain the match using only catalog facts and the guest's stated preferences.
- Keep each reason concise and useful.
- The overall explanation must summarize how the choices satisfy the request.
- Return JSON matching the provided schema.
`.trim();

    const result = await generateStructuredContent({
      prompt,
      maxOutputTokens: 1400,
      responseJsonSchema: {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                foodId: { type: 'string' },
                name: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['foodId', 'name', 'reason'],
              additionalProperties: false,
            },
          },
        },
        required: ['explanation', 'recommendations'],
        additionalProperties: false,
      },
    });

    const foodById = new Map(foods.map((food) => [String(food._id), food]));
    const seen = new Set();
    const recommendations = (Array.isArray(result.recommendations) ? result.recommendations : [])
      .map((recommendation) => {
        const id = cleanString(recommendation.foodId, 50);
        const food = foodById.get(id);
        if (!food || seen.has(id)) return null;
        seen.add(id);
        return {
          _id: id,
          name: food.name,
          category: food.category,
          price: food.price,
          rating: food.rating,
          description: food.description,
          image: food.image,
          status: food.status || 'available',
          reason: cleanString(recommendation.reason, 700),
        };
      })
      .filter((recommendation) => recommendation?.reason)
      .slice(0, 5);

    if (!recommendations.length) {
      throw new GeminiServiceError(
        'The AI could not produce a grounded recommendation. Please try a more specific request.',
        502,
        'NO_GROUNDED_RECOMMENDATIONS'
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Recommendations generated successfully.',
      data: {
        request,
        explanation: cleanString(result.explanation, 1500),
        recommendations,
      },
    });
  } catch (error) {
    return sendAiError(res, error);
  }
};

module.exports = { generateFoodDescription, recommendFoods };
