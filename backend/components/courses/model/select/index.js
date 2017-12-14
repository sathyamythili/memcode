import { db } from '~/db/init.js';
import { camelizeDbColumns } from '~/services/camelizeDbColumns';

import { fetchCoursesAndTheirStats } from '~/model/select';

const wherePublic = `
  course.if_public = true
    AND
  (
    SELECT COUNT(problem.id) FROM problem WHERE problem.course_id = course.id
  ) >= 2
`;

const select = {
  allCreated: (userId) =>
    fetchCoursesAndTheirStats(`WHERE course.user_id = \${userId}`, '', userId),

  // for /profile. returns all courses userId is currently learning.
  // only active,
  // filtered by amount of due problems (TODO)
  allLearned: (userId) =>
    fetchCoursesAndTheirStats(
      `
        WHERE course_user_is_learning.user_id = \${userId} AND course_user_is_learning.active = true
      `,
      `
        ORDER BY
          amount_of_problems_to_review DESC,
          amount_of_problems_to_learn DESC,
          next_due_date_in ASC
      `,
      userId
    ),

  // all public courses with 2 or more problems,
  // sorted by amount of learners
  // @sortBy = ['popular', 'new']
  allPublic: ({ sortBy, limit, offset }) =>
    db.any(
      `
      SELECT
        row_to_json(course.*) AS course,
        COUNT(distinct course_user_is_learning.user_id) AS amount_of_users_learning_this_course,
        COUNT(distinct problem.id) AS amount_of_problems
      FROM course
      LEFT OUTER JOIN course_user_is_learning
        ON (
          course_user_is_learning.active = true
          AND
          course.id = course_user_is_learning.course_id
        )
      INNER JOIN problem
        ON problem.course_id = course.id
      WHERE ${wherePublic}
      GROUP BY course.id
      ${
        sortBy === 'popular' ?
          `
          ORDER BY
            amount_of_users_learning_this_course DESC,
            amount_of_problems DESC
          ` :
          `ORDER BY course.created_at DESC`
      }
      LIMIT ${limit}
      OFFSET ${offset}
      `
    )
      .then((array) => camelizeDbColumns(array, ['course'])),

  countAllPublic: () =>
    db.one(
      `
      SELECT
        COUNT(course.id) as amount_of_public_courses
      FROM course
      WHERE ${wherePublic}
      `
    )
      .then((result) => result.amountOfPublicCourses),

  oneForActions: (id, userId) =>
    fetchCoursesAndTheirStats(`WHERE course.id = ${id}`, '', userId)
      .then((array) => array[0]),

  getCourseStats: (id) =>
    db.one(
      `
      SELECT
        COUNT(distinct course_user_is_learning.user_id) AS amount_of_users_learning_this_course,
        COUNT(distinct problem.id) AS amount_of_problems
      FROM course
      LEFT JOIN course_user_is_learning
        ON (
          course_user_is_learning.active = true
          AND
          course.id = course_user_is_learning.course_id
        )
      LEFT JOIN problem
        ON problem.course_id = course.id
      WHERE course.id = \${id}
      GROUP BY course.id
      `,
      { id }
    ),

  oneById: (id) =>
    db.one(
      `
      SELECT *
      FROM course
      WHERE course.id = \${id}
      `,
      { id }
    ),

  search: (userId, searchString) =>
    fetchCoursesAndTheirStats(
      `
        WHERE
          (
            course.title ILIKE '%${searchString}%' OR
            course.description ILIKE '%${searchString}%'
          )
            AND
          ( -- either public or created by me
            course.user_id = \${userId} OR
            ${wherePublic}
          )
      `,
      `
        ORDER BY
          -- if matches by description instead of by title - place last
          CASE
            WHEN course.title ILIKE '%${searchString}%'
            THEN 1 ELSE 0
          END DESC,
          CASE
            WHEN course_user_is_learning.active = true
            THEN 1 ELSE 0
          END DESC,
          CASE
            WHEN course_user_is_learning.user_id = \${userId}
            THEN 1 ELSE 0
          END DESC,
          CASE
            WHEN course.user_id = \${userId}
            THEN 1 ELSE 0
          END DESC,
          amount_of_problems_to_review DESC,
          amount_of_problems_to_learn DESC,
          next_due_date_in ASC
        LIMIT 10
      `,
      userId
    ),
};

export { select };
